import assert from 'node:assert/strict';
import test from 'node:test';
import { parseYahooInjuryStatus } from './injury-status.ts';

test('OUT maps to 0.03', () => {
  assert.equal(parseYahooInjuryStatus('OUT').status, 'OUT');
  assert.equal(parseYahooInjuryStatus('OUT').availabilityProbability, 0.03);
});

test('IL and IL+ map to OUT', () => {
  assert.equal(parseYahooInjuryStatus('IL').status, 'OUT');
  assert.equal(parseYahooInjuryStatus('IL+').status, 'OUT');
});

test('GTD and Questionable map to QUESTIONABLE (0.6)', () => {
  assert.equal(parseYahooInjuryStatus('GTD').availabilityProbability, 0.6);
  assert.equal(parseYahooInjuryStatus('Questionable').availabilityProbability, 0.6);
});

test('Doubtful maps to 0.25', () => {
  assert.equal(parseYahooInjuryStatus('Doubtful').availabilityProbability, 0.25);
});

test('Probable maps to 0.9', () => {
  assert.equal(parseYahooInjuryStatus('Probable').availabilityProbability, 0.9);
});

test('Active maps to 0.99', () => {
  assert.equal(parseYahooInjuryStatus('Active').availabilityProbability, 0.99);
});

test('empty string falls back to conservative UNKNOWN default', () => {
  const result = parseYahooInjuryStatus('');
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.availabilityProbability, 0.85);
  assert.equal(result.note, 'unparsed status');
});

test('garbage input falls back to conservative UNKNOWN default, never 100%', () => {
  const result = parseYahooInjuryStatus('asdkfjasldkfj 1234 !!!');
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.availabilityProbability, 0.85);
});

test('a full Yahoo roster row containing PG/SF tokens is not mistaken for a status', () => {
  const result = parseYahooInjuryStatus('LeBron James PG SF LAL 25.4 PTS 7.1 REB');
  assert.equal(result.status, 'UNKNOWN');
});

test('status embedded in a longer row is still detected', () => {
  const result = parseYahooInjuryStatus('LeBron James - Out (ankle) LAL SF PF');
  assert.equal(result.status, 'OUT');
});
