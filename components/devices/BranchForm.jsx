'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, Label } from '@/components/ui'
import { isValidHost } from '@/lib/utils'

const optionalHost = z.string().trim().refine((value) => !value || isValidHost(value), 'Enter a valid IP address or hostname')
const schema = z.object({
  name: z.string().trim().min(2, 'Branch name is required'),
  code: z.string().trim().min(2, 'Branch code is required').max(20).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, dash, or underscore'),
  link1: z.string().trim().optional(), ip_link1: optionalHost,
  link2: z.string().trim().optional(), ip_link2: optionalHost,
  manager_name: z.string().trim().optional(), manager_tell: z.string().trim().optional(),
  deputy_name: z.string().trim().optional(), deputy_tell: z.string().trim().optional()
})
const defaults = { name: '', code: '', link1: '', ip_link1: '', link2: '', ip_link2: '', manager_name: '', manager_tell: '', deputy_name: '', deputy_tell: '' }

export default function BranchForm({ value, onSubmit, saving }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: defaults })
  useEffect(() => { reset(value ? { ...defaults, ...value } : defaults) }, [value, reset])
  const field = (name, label, placeholder, props = {}) => <label><Label>{label}</Label><Input placeholder={placeholder} {...register(name)} {...props} />{errors[name] && <p className="mt-1 text-[11px] text-nord-11">{errors[name].message}</p>}</label>
  return <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">{field('name', 'Branch name *', 'Central Berlin')}{field('code', 'Branch code *', 'BER-01')}</div>
    <fieldset className="rounded-xl border p-4"><legend className="px-2 text-xs font-bold">Network links</legend><div className="grid gap-4 sm:grid-cols-2">{field('link1', 'Primary link', 'MPLS / ISP name')}{field('ip_link1', 'Primary gateway', '10.10.1.1')}{field('link2', 'Backup link', 'LTE / ISP name')}{field('ip_link2', 'Backup gateway', '10.10.1.2')}</div></fieldset>
    <fieldset className="rounded-xl border p-4"><legend className="px-2 text-xs font-bold">Branch contacts</legend><div className="grid gap-4 sm:grid-cols-2">{field('manager_name', 'Manager', 'Full name')}{field('manager_tell', 'Manager phone', '+49 …', { type: 'tel' })}{field('deputy_name', 'Deputy', 'Full name')}{field('deputy_tell', 'Deputy phone', '+49 …', { type: 'tel' })}</div></fieldset>
    <div className="flex justify-end"><Button disabled={saving}>{saving ? 'Saving…' : value ? 'Save branch' : 'Add branch'}</Button></div>
  </form>
}
