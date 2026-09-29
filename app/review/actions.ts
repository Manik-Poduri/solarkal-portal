'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'

export async function approve(formData: FormData) {
  const { supabase, role } = await requireUser()
  if (role !== 'approver') throw new Error('Only the approver can approve proposals')
  const id = Number(formData.get('id'))
  if (!Number.isInteger(id)) throw new Error('Bad proposal id')
  const { error } = await supabase.rpc('approve_proposal', { p_id: id })
  if (error) throw new Error(error.message)
  revalidatePath('/review')
  revalidatePath('/')
}

export async function reject(formData: FormData) {
  const { supabase, role } = await requireUser()
  if (role !== 'approver') throw new Error('Only the approver can reject proposals')
  const id = Number(formData.get('id'))
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 500)
  if (!Number.isInteger(id)) throw new Error('Bad proposal id')
  if (!reason) throw new Error('A rejection reason is required')
  const { error } = await supabase.rpc('reject_proposal', { p_id: id, p_reason: reason })
  if (error) throw new Error(error.message)
  revalidatePath('/review')
}