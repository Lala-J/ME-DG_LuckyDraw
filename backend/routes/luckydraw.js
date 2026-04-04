const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { getDb } = require('../db');
const auth = require('../middleware/auth');

// GET /api/luckydraw/config
router.get('/config', auth, (req, res) => {
  try {
    const db = getDb();
    const rounds = db.prepare('SELECT * FROM lucky_draw_rounds ORDER BY round_number ASC').all();
    const results = db.prepare('SELECT * FROM lucky_draw_results ORDER BY round_number ASC, id ASC').all();
    const allPrizes = db.prepare('SELECT * FROM prizes ORDER BY id ASC').all();
    const roundPrizeAssignments = db.prepare('SELECT rp.*, p.name, p.picture_filename FROM lucky_draw_round_prizes rp JOIN prizes p ON p.prize_id = rp.prize_id ORDER BY rp.round_number ASC, rp.id ASC').all();

    const resultsByRound = {};
    for (const r of results) {
      if (!resultsByRound[r.round_number]) resultsByRound[r.round_number] = [];
      resultsByRound[r.round_number].push(r);
    }

    const prizesByRound = {};
    for (const rp of roundPrizeAssignments) {
      if (!prizesByRound[rp.round_number]) prizesByRound[rp.round_number] = [];
      prizesByRound[rp.round_number].push({
        prizeId: rp.prize_id,
        name: rp.name,
        picturePath: rp.picture_filename ? `/api/prizes/${rp.prize_id}/picture` : null
      });
    }

    const assignedPrizeIds = new Set(roundPrizeAssignments.map(rp => rp.prize_id));

    const roundsWithData = rounds.map(round => ({
      roundNumber: round.round_number,
      customName: round.custom_name || '',
      executed: !!round.executed,
      prizes: prizesByRound[round.round_number] || [],
      winners: (resultsByRound[round.round_number] || []).map(r => ({
        registrationId: r.registration_id,
        fullName: r.full_name,
        staffId: r.staff_id,
        prizeId: r.prize_id || ''
      }))
    }));

    res.json({
      totalRounds: rounds.length,
      rounds: roundsWithData,
      allPrizes: allPrizes.map(p => ({
        ...p,
        assignedRound: roundPrizeAssignments.find(rp => rp.prize_id === p.prize_id)?.round_number || null,
        picturePath: p.picture_filename ? `/api/prizes/${p.prize_id}/picture` : null
      })),
      availablePrizeCount: allPrizes.filter(p => !assignedPrizeIds.has(p.prize_id)).length
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/luckydraw/rounds — add a new round
router.post('/rounds', auth, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT round_number FROM lucky_draw_rounds ORDER BY round_number ASC').all();
    // Find the next round number (highest + 1)
    const nextNum = existing.length > 0 ? Math.max(...existing.map(r => r.round_number)) + 1 : 1;
    db.prepare("INSERT INTO lucky_draw_rounds (round_number, winner_count, executed, custom_name) VALUES (?, 0, 0, '')").run(nextNum);
    db.prepare('INSERT INTO audit_draw_changes (action_type, details) VALUES (?, ?)').run(
      'round_added', JSON.stringify({ round_number: nextNum, custom_name: '' })
    );
    res.json({ success: true, roundNumber: nextNum });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// DELETE /api/luckydraw/rounds/:roundNumber
router.delete('/rounds/:roundNumber', auth, (req, res) => {
  try {
    const db = getDb();
    const roundNumber = parseInt(req.params.roundNumber);
    if (isNaN(roundNumber)) return res.status(400).json({ error: 'Invalid round number' });

    const round = db.prepare('SELECT * FROM lucky_draw_rounds WHERE round_number = ?').get(roundNumber);
    if (!round) return res.status(404).json({ error: 'Round not found' });
    if (round.executed) return res.status(400).json({ error: 'Cannot delete an executed round. Reset it first.' });

    db.transaction(() => {
      db.prepare('DELETE FROM lucky_draw_round_prizes WHERE round_number = ?').run(roundNumber);
      db.prepare('DELETE FROM lucky_draw_rounds WHERE round_number = ?').run(roundNumber);
    })();
    db.prepare('INSERT INTO audit_draw_changes (action_type, details) VALUES (?, ?)').run(
      'round_deleted', JSON.stringify({ round_number: roundNumber, custom_name: round.custom_name || '' })
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// PUT /api/luckydraw/rounds/:roundNumber/prizes — set prizes for a round
router.put('/rounds/:roundNumber/prizes', auth, (req, res) => {
  try {
    const db = getDb();
    const roundNumber = parseInt(req.params.roundNumber);
    if (isNaN(roundNumber)) return res.status(400).json({ error: 'Invalid round number' });

    const round = db.prepare('SELECT * FROM lucky_draw_rounds WHERE round_number = ?').get(roundNumber);
    if (!round) return res.status(404).json({ error: 'Round not found' });
    if (round.executed) return res.status(400).json({ error: 'Cannot modify prizes for an executed round' });

    const { prizeIds } = req.body;
    if (!Array.isArray(prizeIds)) return res.status(400).json({ error: 'prizeIds must be an array' });

    // Validate: no prize assigned to another round
    for (const prizeId of prizeIds) {
      const conflict = db.prepare('SELECT * FROM lucky_draw_round_prizes WHERE prize_id = ? AND round_number != ?').get(prizeId, roundNumber);
      if (conflict) return res.status(400).json({ error: `Prize ${prizeId} is already assigned to round ${conflict.round_number}` });
      const exists = db.prepare('SELECT id FROM prizes WHERE prize_id = ?').get(prizeId);
      if (!exists) return res.status(400).json({ error: `Prize ${prizeId} does not exist` });
    }

    db.transaction(() => {
      db.prepare('DELETE FROM lucky_draw_round_prizes WHERE round_number = ?').run(roundNumber);
      const insert = db.prepare('INSERT INTO lucky_draw_round_prizes (round_number, prize_id) VALUES (?, ?)');
      for (const prizeId of prizeIds) insert.run(roundNumber, prizeId);
      db.prepare('UPDATE lucky_draw_rounds SET winner_count = ? WHERE round_number = ?').run(prizeIds.length, roundNumber);
    })();
    const prizeNames = prizeIds.map(id => {
      const p = db.prepare('SELECT name FROM prizes WHERE prize_id = ?').get(id);
      return p ? p.name : id;
    });
    db.prepare('INSERT INTO audit_draw_changes (action_type, details) VALUES (?, ?)').run(
      'prize_configuration', JSON.stringify({ round_number: roundNumber, custom_name: round.custom_name || '', prize_names: prizeNames })
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// PUT /api/luckydraw/rounds/:roundNumber/name — set custom name
router.put('/rounds/:roundNumber/name', auth, (req, res) => {
  try {
    const db = getDb();
    const roundNumber = parseInt(req.params.roundNumber);
    if (isNaN(roundNumber)) return res.status(400).json({ error: 'Invalid round number' });

    const { customName } = req.body;
    const result = db.prepare('UPDATE lucky_draw_rounds SET custom_name = ? WHERE round_number = ?').run(customName || '', roundNumber);
    if (result.changes === 0) return res.status(404).json({ error: 'Round not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/luckydraw/run/:roundNumber
router.post('/run/:roundNumber', auth, (req, res) => {
  try {
    const db = getDb();
    const roundNumber = parseInt(req.params.roundNumber);
    if (isNaN(roundNumber) || roundNumber < 1) return res.status(400).json({ error: 'Invalid round number' });

    const round = db.prepare('SELECT * FROM lucky_draw_rounds WHERE round_number = ?').get(roundNumber);
    if (!round) return res.status(404).json({ error: 'Round not found' });
    if (round.executed) return res.status(400).json({ error: 'This round has already been executed' });

    const roundPrizes = db.prepare(`
      SELECT p.* FROM lucky_draw_round_prizes rp
      JOIN prizes p ON p.prize_id = rp.prize_id
      WHERE rp.round_number = ?
      ORDER BY rp.id ASC
    `).all(roundNumber);

    if (roundPrizes.length === 0) return res.status(400).json({ error: 'No prizes configured for this round' });

    const eligible = db.prepare("SELECT * FROM registration_table WHERE prize_winner_mark = ''").all();
    if (eligible.length === 0) return res.status(400).json({ error: 'No eligible participants available' });

    const priorRun = db.prepare(
      "SELECT id FROM audit_draw_changes WHERE action_type IN ('roulette_ran', 'roulette_redrawn') AND details LIKE ?"
    ).get(`%"round_number":${roundNumber},%`);
    const drawActionType = priorRun ? 'roulette_redrawn' : 'roulette_ran';

    const actualCount = Math.min(roundPrizes.length, eligible.length);

    // Fisher-Yates shuffle participants (crypto.randomInt for fairness)
    const shuffledParticipants = [...eligible];
    for (let i = shuffledParticipants.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [shuffledParticipants[i], shuffledParticipants[j]] = [shuffledParticipants[j], shuffledParticipants[i]];
    }
    const selectedWinners = shuffledParticipants.slice(0, actualCount);

    // Fisher-Yates shuffle prizes (crypto.randomInt for fairness)
    const shuffledPrizes = [...roundPrizes];
    for (let i = shuffledPrizes.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [shuffledPrizes[i], shuffledPrizes[j]] = [shuffledPrizes[j], shuffledPrizes[i]];
    }

    db.transaction(() => {
      const markWinner = db.prepare('UPDATE registration_table SET prize_winner_mark = ? WHERE id = ?');
      const insertResult = db.prepare('INSERT INTO lucky_draw_results (round_number, registration_id, full_name, staff_id, prize_id) VALUES (?, ?, ?, ?, ?)');
      for (let i = 0; i < actualCount; i++) {
        const winner = selectedWinners[i];
        const prize = shuffledPrizes[i];
        markWinner.run(prize.prize_id, winner.id);
        insertResult.run(roundNumber, winner.id, winner.full_name, winner.staff_id, prize.prize_id);
      }
      db.prepare('UPDATE lucky_draw_rounds SET executed = 1 WHERE round_number = ?').run(roundNumber);
    })();

    const resultWinners = selectedWinners.map((w, i) => ({
      registrationId: w.id,
      fullName: w.full_name,
      staffId: w.staff_id,
      title: w.title || '',
      department: w.department || '',
      location: w.location || '',
      prizeId: shuffledPrizes[i].prize_id,
      prizeName: shuffledPrizes[i].name,
      prizePicture: shuffledPrizes[i].picture_filename ? `/api/prizes/${shuffledPrizes[i].prize_id}/picture` : null
    }));

    db.prepare('INSERT INTO audit_draw_changes (action_type, details) VALUES (?, ?)').run(
      drawActionType,
      JSON.stringify({
        round_number: roundNumber,
        custom_name: round.custom_name || '',
        winners: resultWinners.map(w => ({ full_name: w.fullName, staff_id: w.staffId, prize_name: w.prizeName }))
      })
    );

    res.json({ success: true, winners: resultWinners });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/luckydraw/reset
router.post('/reset', auth, (req, res) => {
  try {
    const db = getDb();
    db.transaction(() => {
      db.prepare('DELETE FROM lucky_draw_results').run();
      db.prepare('DELETE FROM lucky_draw_round_prizes').run();
      db.prepare('DELETE FROM lucky_draw_rounds').run();
      db.prepare("UPDATE registration_table SET prize_winner_mark = ''").run();
      db.prepare("INSERT INTO config (key, value) VALUES ('lucky_draw_rounds', '0') ON CONFLICT(key) DO UPDATE SET value = '0'").run();
    })();
    db.prepare('INSERT INTO audit_draw_changes (action_type, details) VALUES (?, ?)').run('lucky_draw_reset', '{}');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/luckydraw/reset-round/:roundNumber
router.post('/reset-round/:roundNumber', auth, (req, res) => {
  try {
    const db = getDb();
    const roundNumber = parseInt(req.params.roundNumber);
    if (isNaN(roundNumber) || roundNumber < 1) return res.status(400).json({ error: 'Invalid round number' });

    const round = db.prepare('SELECT * FROM lucky_draw_rounds WHERE round_number = ?').get(roundNumber);
    if (!round) return res.status(404).json({ error: 'Round not found' });

    db.transaction(() => {
      // Get prize_ids used in this round so we can clear winner marks
      const prizeIds = db.prepare('SELECT DISTINCT prize_id FROM lucky_draw_results WHERE round_number = ?').all(roundNumber).map(r => r.prize_id);
      for (const prizeId of prizeIds) {
        db.prepare("UPDATE registration_table SET prize_winner_mark = '' WHERE prize_winner_mark = ?").run(prizeId);
      }
      db.prepare('DELETE FROM lucky_draw_results WHERE round_number = ?').run(roundNumber);
      db.prepare('UPDATE lucky_draw_rounds SET executed = 0 WHERE round_number = ?').run(roundNumber);
    })();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

// POST /api/luckydraw/configure — kept for backward compat (creates N rounds with no prizes)
router.post('/configure', auth, (req, res) => {
  try {
    const db = getDb();
    const { rounds } = req.body;
    if (!rounds || rounds < 1) return res.status(400).json({ error: 'rounds must be at least 1' });

    db.transaction(() => {
      db.prepare('DELETE FROM lucky_draw_results').run();
      db.prepare('DELETE FROM lucky_draw_round_prizes').run();
      db.prepare('DELETE FROM lucky_draw_rounds').run();
      db.prepare("UPDATE registration_table SET prize_winner_mark = ''").run();
      const insert = db.prepare("INSERT INTO lucky_draw_rounds (round_number, winner_count, executed, custom_name) VALUES (?, 0, 0, '')");
      for (let i = 1; i <= rounds; i++) insert.run(i);
      db.prepare("INSERT INTO config (key, value) VALUES ('lucky_draw_rounds', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(rounds));
    })();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error' });
  }
});

module.exports = router;
