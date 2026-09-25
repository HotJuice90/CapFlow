import { lastMeeting, meetingOutcome, nextMeeting, shouldSyncKeyRate } from './keyRateMeetings';

const meetings = ['2026-07-24', '2026-09-11', '2026-10-23'];

describe('график заседаний', () => {
  it('последнее состоявшееся — не путать с ближайшим будущим', () => {
    expect(lastMeeting(new Date(2026, 8, 26), meetings)).toBe('2026-09-11');
    expect(nextMeeting(new Date(2026, 8, 26), meetings)).toBe('2026-10-23');
  });

  it('заседание сегодня считается состоявшимся', () => {
    expect(lastMeeting(new Date(2026, 8, 11), meetings)).toBe('2026-09-11');
  });

  it('график кончился — следующего нет, но последнее остаётся', () => {
    expect(nextMeeting(new Date(2027, 0, 15), meetings)).toBeUndefined();
    expect(lastMeeting(new Date(2027, 0, 15), meetings)).toBe('2026-10-23');
  });

  it('ставку сохранили: изменений после заседания нет', () => {
    expect(meetingOutcome('2026-09-11', ['2026-07-27', '2026-06-22'])).toBe('kept');
  });

  it('ставку изменили: решение вступило в силу через несколько дней после заседания', () => {
    expect(meetingOutcome('2026-07-24', ['2026-07-27', '2026-06-22'])).toBe('changed');
  });
});

describe('shouldSyncKeyRate', () => {
  it('ни разу не сверялись — сверяемся', () => {
    expect(shouldSyncKeyRate(null, new Date(2026, 8, 26), meetings)).toBe(true);
  });

  it('после прошлой сверки прошло заседание — сверяемся', () => {
    expect(shouldSyncKeyRate('2026-09-01T10:00:00.000Z', new Date(2026, 8, 26), meetings)).toBe(true);
  });

  it('заседаний с прошлой сверки не было — не дёргаем ЦБ', () => {
    expect(shouldSyncKeyRate('2026-09-20T10:00:00.000Z', new Date(2026, 8, 26), meetings)).toBe(false);
  });

  it('график кончился, но сверка давно — всё равно сверяемся', () => {
    expect(shouldSyncKeyRate('2026-11-01T10:00:00.000Z', new Date(2027, 5, 1), meetings)).toBe(true);
  });
});
