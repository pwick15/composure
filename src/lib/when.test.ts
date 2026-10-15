import { describe, expect, it } from 'vitest'
import { LATER } from './dates'
import { whenOptions } from './when'

// Friday 16 October 2026.
const TODAY = '2026-10-16'
const first = (q: string, current: string | null = null) => whenOptions(q, TODAY, current)[0]?.slot
const all = (q: string) => whenOptions(q, TODAY, null).map((o) => o.slot)

describe('whenOptions', () => {
  it('offers the usual picks when nothing is typed', () => {
    expect(all('')).toEqual([TODAY, '2026-10-17', '2026-10-17', '2026-10-19', LATER].filter((s, i, a) => a.indexOf(s) === i))
    expect(whenOptions('', TODAY, TODAY).at(-1)).toMatchObject({ slot: null, label: 'No day' })
    expect(whenOptions('', TODAY, null).some((o) => o.slot === null)).toBe(false)
  })

  it('names days of the week, meaning the upcoming one', () => {
    expect(first('tuesday')).toBe('2026-10-20')
    expect(first('tue')).toBe('2026-10-20')
    expect(first('Tues')).toBe('2026-10-20')
    expect(first('saturday')).toBe('2026-10-17')
    expect(first('friday')).toBe('2026-10-23') // today is a Friday: the next one
  })

  it('"next" skips to the following week', () => {
    expect(first('next friday')).toBe('2026-10-23')
    expect(first('next sat')).toBe('2026-10-24') // this week's Saturday is still this week
    expect(first('next tuesday')).toBe('2026-10-20')
    expect(first('next week')).toBe('2026-10-19')
    expect(first('next month')).toBe('2026-11-01')
  })

  it('understands today, tomorrow, the weekend and later', () => {
    expect(first('today')).toBe(TODAY)
    expect(first('tmrw')).toBe('2026-10-17')
    expect(first('tomorrow')).toBe('2026-10-17')
    expect(first('weekend')).toBe('2026-10-17')
    expect(first('later')).toBe(LATER)
    expect(first('someday')).toBe(LATER)
    expect(first('none', TODAY)).toBe(null)
  })

  it('a half-typed word lists everything it could be', () => {
    expect(all('t')).toEqual(expect.arrayContaining([TODAY, '2026-10-17', '2026-10-20', '2026-10-22']))
    expect(all('tu')).toEqual(['2026-10-20'])
  })

  it('counts days, weeks and months from today', () => {
    expect(first('two days')).toBe('2026-10-18')
    expect(first('in 2 days')).toBe('2026-10-18')
    expect(first('3d')).toBe('2026-10-19')
    expect(first('+3')).toBe('2026-10-19')
    expect(first('a week')).toBe('2026-10-23')
    expect(first('2 weeks')).toBe('2026-10-30')
    expect(first('1w')).toBe('2026-10-23')
    expect(first('in 3 months')).toBe('2027-01-16')
    expect(first('1 month')).toBe('2026-11-16')
  })

  it('reads dd/mm/yyyy, dd/mm and ISO dates', () => {
    expect(first('24/12/2026')).toBe('2026-12-24')
    expect(first('24/12/26')).toBe('2026-12-24')
    expect(first('1.2.2027')).toBe('2027-02-01')
    expect(first('2027-02-01')).toBe('2027-02-01')
    expect(first('24/12')).toBe('2026-12-24')
    expect(first('5/3')).toBe('2027-03-05') // March has passed: next year
    expect(first('16/10')).toBe(TODAY)
  })

  it('reads dates written with month names', () => {
    expect(first('20 oct')).toBe('2026-10-20')
    expect(first('oct 20')).toBe('2026-10-20')
    expect(first('20th october')).toBe('2026-10-20')
    expect(first('15 oct')).toBe('2027-10-15') // passed this year
    expect(first('1 jan 2028')).toBe('2028-01-01')
    expect(first('december 25, 2026')).toBe('2026-12-25')
    expect(first('3 sept')).toBe('2027-09-03')
  })

  it('a bare number is the next such day of the month', () => {
    expect(first('22')).toBe('2026-10-22')
    expect(first('5')).toBe('2026-11-05')
    expect(first('31')).toBe('2026-10-31')
    expect(first('16')).toBe(TODAY)
  })

  it('offers nothing for days that do not exist or are already gone', () => {
    expect(all('31/02/2026')).toEqual([])
    expect(all('1/1/2020')).toEqual([])
    expect(all('gibberish')).toEqual([])
  })

  it('says what it means', () => {
    const [tue] = whenOptions('tue', TODAY, null)
    expect(tue).toMatchObject({ label: 'Tuesday', hint: 'Tue 20 Oct' })
    expect(whenOptions('24/12/2027', TODAY, null)[0]).toMatchObject({ label: 'Fri 24 Dec 2027', hint: 'in 14 months' })
    expect(whenOptions('2 weeks', TODAY, null)[0]).toMatchObject({ label: 'Fri 30 Oct', hint: 'in 2 weeks' })
  })
})
