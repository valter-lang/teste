import { NextResponse } from 'next/server'
import { q1 } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await q1('select 1')
    return NextResponse.json({ status: 'ok' })
  } catch {
    return NextResponse.json({ status: 'erro_banco' }, { status: 503 })
  }
}
