import { db } from '@/db'
import { sql } from 'drizzle-orm'

export function getShanghaiDateKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export async function incrementSiteGenerationStats(count = 1) {
  const normalizedCount = Math.floor(count)
  const safeCount = Number.isFinite(normalizedCount) && normalizedCount > 0 ? normalizedCount : 1

  await db.execute(sql`
    insert into site_stats (
      id,
      total_generations,
      daily_generations,
      last_reset_date,
      created_at,
      updated_at
    )
    values (
      1,
      0,
      0,
      now(),
      now(),
      now()
    )
    on conflict (id) do nothing
  `)

  await db.execute(sql`
    update site_stats
    set
      total_generations = coalesce(total_generations, 0) + ${safeCount},
      daily_generations = case
        when last_reset_date is null
          or (last_reset_date at time zone 'Asia/Shanghai')::date <> (now() at time zone 'Asia/Shanghai')::date
        then ${safeCount}
        else coalesce(daily_generations, 0) + ${safeCount}
      end,
      last_reset_date = case
        when last_reset_date is null
          or (last_reset_date at time zone 'Asia/Shanghai')::date <> (now() at time zone 'Asia/Shanghai')::date
        then now()
        else last_reset_date
      end,
      updated_at = now()
    where id = 1
  `)
}
