const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const auth = require('../middleware/auth');

// POST /api/luckydraw/configure
router.post('/configure', auth, (req, res) => {
  try {
    const db = getDb();
    const { rounds, winnerCounts } = req.body;

    if (!rounds || rounds < 1 || rounds > 5) {
      return res.status(400).json({ error: 'Rounds must be between 1 and 5' });
    }

    // winnerCounts is optional at configure time; defaults to 1 per round
    const counts = Array.isArray(winnerCounts) && winnerCounts.length === rounds
      ? winnerCounts
      : Array(rounds).fill(1);

    for (let i = 0; i < counts.length; i++) {
      if (!Number.isInteger(counts[i]) || counts[i] < 1) {
        return res.status(400).json({ error: `Winner count for round ${i + 1} must be a positive integer` });
      }
    }

    const configure = db.transaction(() => {
      db.prepare('DELETE FROM lucky_draw_results').run();
      db.prepare('DELETE FROM lucky_draw_rounds').run();
      db.prepare("UPDATE registration_table SET prize_winner_mark = ''").run();

      const insert = db.prepare('INSERT INTO lucky_draw_rounds (round_number, winner_count, executed) VALUES (?, ?, 0)');
      for (let i = 0; i < rounds; i++) {
        insert.run(i + 1, counts[i]);
      }

      db.prepare("INSERT INTO config (key, value) VALUES ('lucky_draw_rounds', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(rounds));
    });

    configure();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/luckydraw/config
router.get('/config', (req, res) => {
  try {
    const db = getDb();
    const rounds = db.prepare('SELECT * FROM lucky_draw_rounds ORDER BY round_number ASC').all();
    const results = db.prepare('SELECT * FROM lucky_draw_results ORDER BY round_number ASC, id ASC').all();
    const configRow = db.prepare("SELECT value FROM config WHERE key = 'lucky_draw_rounds'").get();

    const resultsByRound = {};
    for (const r of results) {
      if (!resultsByRound[r.round_number]) {
        resultsByRound[r.round_number] = [];
      }
      resultsByRound[r.round_number].push(r);
    }

    const roundsWithResults = rounds.map(round => ({
      roundNumber: round.round_number,
      winnerCount: round.winner_count,
      executed: !!round.executed,
      winners: (resultsByRound[round.round_number] || []).map(r => ({
        registrationId: r.registration_id,
        fullName: r.full_name,
        staffId: r.staff_id
      }))
    }));

    res.json({
      totalRounds: configRow ? parseInt(configRow.value) : 0,
      rounds: roundsWithResults
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/luckydraw/run/:roundNumber
router.post('/run/:roundNumber', auth, (req, res) => {
  try {
    const db = getDb();
    const roundNumber = parseInt(req.params.roundNumber);
    if (isNaN(roundNumber) || roundNumber < 1) {
      return res.status(400).json({ error: 'Invalid round number' });
    }

    const round = db.prepare('SELECT * FROM lucky_draw_rounds WHERE round_number = ?').get(roundNumber);
    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }

    if (round.executed) {
      return res.status(400).json({ error: 'This round has already been executed' });
    }

    // Allow overriding winner count from the request body
    const winnerCount = (req.body && req.body.winnerCount && req.body.winnerCount > 0)
      ? req.body.winnerCount
      : round.winner_count;

    // Update the round's winner_count if overridden
    if (winnerCount !== round.winner_count) {
      db.prepare('UPDATE lucky_draw_rounds SET winner_count = ? WHERE round_number = ?').run(winnerCount, roundNumber);
    }

    const eligible = db.prepare("SELECT * FROM registration_table WHERE prize_winner_mark = ''").all();

    if (eligible.length === 0) {
      return res.status(400).json({ error: 'No eligible participants available' });
    }

    const actualCount = Math.min(winnerCount, eligible.length);

    // Fisher-Yates shuffle
    const shuffled = [...eligible];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const winners = shuffled.slice(0, actualCount);

    const runRound = db.transaction(() => {
      const markWinner = db.prepare('UPDATE registration_table SET prize_winner_mark = ? WHERE id = ?');
      const insertResult = db.prepare('INSERT INTO lucky_draw_results (round_number, registration_id, full_name, staff_id) VALUES (?, ?, ?, ?)');
      const markExecuted = db.prepare('UPDATE lucky_draw_rounds SET executed = 1 WHERE round_number = ?');

      for (const winner of winners) {
        markWinner.run(`R${roundNumber}`, winner.id);
        insertResult.run(roundNumber, winner.id, winner.full_name, winner.staff_id);
      }

      markExecuted.run(roundNumber);
    });

    runRound();

    const resultWinners = winners.map(w => ({
      registrationId: w.id,
      fullName: w.full_name,
      staffId: w.staff_id
    }));

    res.json({ success: true, winners: resultWinners });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
