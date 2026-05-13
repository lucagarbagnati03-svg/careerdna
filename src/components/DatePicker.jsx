import { useState, useEffect, useRef } from 'react'
import './DatePicker.css'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 60 }, (_, i) => CURRENT_YEAR - i)

// Full date picker — value = "YYYY-MM-DD" | "".
// onChange is only called when all three selects are filled.
// Uses a ref to distinguish external resets from partial-selection silence.
export default function DatePicker({ value, onChange, required }) {
  const [day,   setDay]   = useState('')
  const [month, setMonth] = useState('')
  const [year,  setYear]  = useState('')
  const lastEmitted = useRef('')

  useEffect(() => {
    if (!value && lastEmitted.current !== '') {
      setDay(''); setMonth(''); setYear('')
      lastEmitted.current = ''
    } else if (value && value !== lastEmitted.current && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-')
      setYear(y); setMonth(m); setDay(d)
      lastEmitted.current = value
    }
  }, [value])

  function emit(d, m, y) {
    if (d && m && y) {
      const full = `${y}-${m}-${d}`
      lastEmitted.current = full
      onChange(full)
    }
  }

  const daysInMonth = (month && year)
    ? new Date(Number(year), Number(month), 0).getDate()
    : 31
  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'))

  function handleDay(d) { setDay(d); emit(d, month, year) }

  function handleMonth(m) {
    const maxDay = new Date(Number(year || 2000), Number(m), 0).getDate()
    const cd = day && Number(day) > maxDay ? String(maxDay).padStart(2, '0') : day
    setMonth(m)
    if (cd !== day) setDay(cd)
    emit(cd, m, year)
  }

  function handleYear(y) {
    const maxDay = month ? new Date(Number(y), Number(month), 0).getDate() : 31
    const cd = day && Number(day) > maxDay ? String(maxDay).padStart(2, '0') : day
    setYear(y)
    if (cd !== day) setDay(cd)
    emit(cd, month, y)
  }

  return (
    <div className="dp-wrap">
      <select value={day} onChange={e => handleDay(e.target.value)} required={required} className="dp-select dp-day">
        <option value="">Day</option>
        {days.map(d => <option key={d} value={d}>{Number(d)}</option>)}
      </select>
      <select value={month} onChange={e => handleMonth(e.target.value)} required={required} className="dp-select dp-month">
        <option value="">Month</option>
        {MONTHS.map((m, i) => (
          <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
        ))}
      </select>
      <select value={year} onChange={e => handleYear(e.target.value)} required={required} className="dp-select dp-year">
        <option value="">Year</option>
        {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </div>
  )
}
