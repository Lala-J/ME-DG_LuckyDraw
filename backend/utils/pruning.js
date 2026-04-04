// Data pruning utilities for the Experimental Features — Data Pruning settings.
// These functions are applied to user-supplied input BEFORE it is compared
// against the validation_table, so that minor formatting differences in names
// or phone numbers do not cause registration to fail.

// ---------------------------------------------------------------------------
// Country-code list — E.164 format, sorted longest-first for greedy matching.
// 4-digit NANP sub-codes must come before the bare '1' entry.
// ---------------------------------------------------------------------------
const COUNTRY_CODES = [
  // 4-digit NANP area codes (Caribbean / US territories under +1)
  '1242','1246','1264','1268','1284','1340','1345','1441','1473',
  '1649','1664','1670','1671','1684','1721','1758','1767','1784',
  '1787','1809','1829','1849','1868','1869','1876','1939',
  // 3-digit codes — Africa (2xx)
  '210','211','212','213','216','218',
  '220','221','222','223','224','225','226','227','228','229',
  '230','231','232','233','234','235','236','237','238','239',
  '240','241','242','243','244','245','246','247','248','249',
  '250','251','252','253','254','255','256','257','258',
  '260','261','262','263','264','265','266','267','268','269',
  '290','291','297','298','299',
  // 3-digit codes — Europe (3xx / 4xx)
  '350','351','352','353','354','355','356','357','358','359',
  '370','371','372','373','374','375','376','377','378',
  '380','381','382','385','386','387','389',
  '420','421','423',
  // 3-digit codes — Americas (5xx)
  '500','501','502','503','504','505','506','507','508','509',
  '590','591','592','593','594','595','596','597','598','599',
  // 3-digit codes — Pacific (6xx)
  '670','672','673','674','675','676','677','678','679',
  '680','681','682','683','685','686','687','688','689','690','691','692',
  // 3-digit codes — East/South-East Asia (8xx)
  '850','852','853','855','856','880','886',
  // 3-digit codes — Middle East / Central Asia (9xx)
  '960','961','962','963','964','965','966','967','968',
  '970','971','972','973','974','975','976','977',
  '992','993','994','995','996','998',
  // 2-digit codes
  '20','27',
  '30','31','32','33','34','36','39',
  '40','41','43','44','45','46','47','48','49',
  '51','52','53','54','55','56','57','58',
  '60','61','62','63','64','65','66',
  '81','82','84','86',
  '90','91','92','93','94','95','98',
  // 1-digit codes (last — least specific)
  '7','1',
];

// ---------------------------------------------------------------------------
// pruneSpecialChars
// Strips anything that is not a Latin letter or whitespace from a name.
// e.g. "Tethys Melyon :)" → "Tethys Melyon"
// ---------------------------------------------------------------------------
function pruneSpecialChars(name) {
  return name.replace(/[^A-Za-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// pruneBrackets
// Removes content inside round brackets (and the brackets themselves).
// e.g. "Tethys Melyon (DoSA)" → "Tethys Melyon"
// ---------------------------------------------------------------------------
function pruneBrackets(name) {
  return name.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// pruneCountryCode
// Given a digits-only phone string, strips a leading country-code prefix.
// Returns the stripped number, or the original string if no known prefix
// is found.  The greedy longest-match prevents shorter codes from matching
// first (e.g. '1' would otherwise consume the start of '+1246…').
// @param {string} digits — already normalised (digits only, no '+')
// ---------------------------------------------------------------------------
function pruneCountryCode(digits) {
  for (const code of COUNTRY_CODES) {
    if (digits.startsWith(code) && digits.length > code.length) {
      return digits.slice(code.length);
    }
  }
  return digits;
}

module.exports = { pruneSpecialChars, pruneBrackets, pruneCountryCode };
