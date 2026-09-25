import { lastMeeting, meetingOutcome, nextMeeting } from './keyRateMeetings';

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
