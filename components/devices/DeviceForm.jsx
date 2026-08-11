'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Input, Label, Select, Switch } from '@/components/ui'
import { DEVICE_FIELDS, DEVICE_TYPES } from '@/lib/constants'
import { isValidHost } from '@/lib/utils'

const schema = z.object({
  branch_id: z.coerce.number().int().positive('Select a branch'),
  device_type: z.enum(DEVICE_TYPES),
  name: z.string().trim().optional(),
  ip: z.string().trim().refine(isValidHost, 'Enter a valid IPv4 address or hostname'),
  port: z.union([z.literal(''), z.coerce.number().int().min(1).max(65535)]).optional(),
  model: z.string().trim().optional(), location: z.string().trim().optional(), asset_code: z.string().trim().optional(),
  connection_type: z.string().trim().optional(), connection_port: z.union([z.literal(''), z.coerce.number().int().min(1)]).optional(),
  hostname: z.string().trim().optional(), user: z.string().trim().optional(), domain: z.string().trim().optional(), esxi_version: z.string().trim().optional(),
  version: z.string().trim().optional(), terminal_id: z.string().trim().optional(), acceptance_id: z.string().trim().optional(), brand: z.string().trim().optional(),
  checkout_number: z.union([z.literal(''), z.coerce.number().int().min(1)]).optional(), remote_id: z.string().trim().optional(), protocol: z.string().trim().optional(),
  is_dashboard_visible: z.boolean().optional()
})
const defaults = { branch_id: '', device_type: 'Router', name: '', ip: '', port: '', model: '', location: '', asset_code: '', connection_type: '', connection_port: '', hostname: '', user: '', domain: '', esxi_version: '', version: '', terminal_id: '', acceptance_id: '', brand: '', checkout_number: '', remote_id: '', protocol: 'https', is_dashboard_visible: false }

const labels = { connection_type: 'Connection type', connection_port: 'Connection port', hostname: 'Hostname', user: 'Local user', domain: 'Domain', esxi_version: 'ESXi version', version: 'Software version', terminal_id: 'Terminal ID', acceptance_id: 'Acceptance ID', brand: 'Brand', checkout_number: 'Checkout number' }

export default function DeviceForm({ value, branches, onSubmit, saving }) {
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: defaults })
  useEffect(() => { reset(value ? { ...defaults, ...value, branch_id: value.branch_id, port: value.port || '', connection_port: value.connection_port || '', checkout_number: value.checkout_number || '', is_dashboard_visible: Boolean(value.is_dashboard_visible) } : defaults) }, [value, reset])
  const type = watch('device_type')
  const visible = watch('is_dashboard_visible')
  const customFields = DEVICE_FIELDS[type] || []
  const field = (name, label, placeholder, props = {}) => <label><Label>{label}</Label><Input placeholder={placeholder} {...register(name)} {...props} />{errors[name] && <p className="mt-1 text-[11px] text-nord-11">{errors[name].message}</p>}</label>

  return <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2"><label><Label>Branch *</Label><Select {...register('branch_id')}><option value="">Select branch</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</Select>{errors.branch_id && <p className="mt-1 text-[11px] text-nord-11">{errors.branch_id.message}</p>}</label><label><Label>Device type *</Label><Select {...register('device_type')}>{DEVICE_TYPES.map((item) => <option key={item}>{item}</option>)}</Select></label></div>
    <div className="grid gap-4 sm:grid-cols-2">{field('name', 'Device name', `${type} name`)}{field('ip', 'IP address / hostname *', '10.10.1.10')}{field('port', 'Port', type === 'Checkout' ? '3389' : type === 'POS' ? '443' : 'Optional', { type: 'number' })}{field('model', 'Model', 'Manufacturer and model')}{field('location', 'Location', 'Network room / aisle')}{field('asset_code', 'Asset code', 'HF-BER-001')}</div>
    {customFields.length > 0 && <fieldset className="rounded-xl border p-4"><legend className="px-2 text-xs font-bold">{type} details</legend><div className="grid gap-4 sm:grid-cols-2">{customFields.map((name) => field(name, labels[name], name.includes('number') || name.includes('port') ? '1' : 'Optional', name.includes('number') || name.includes('port') ? { type: 'number' } : {}))}</div></fieldset>}
    {['Router', 'Switch', 'iLO', 'NVR', 'AccessPoint', 'POS'].includes(type) && <div className="grid gap-4 sm:grid-cols-2"><label><Label>Browser protocol</Label><Select {...register('protocol')}><option value="https">HTTPS</option><option value="http">HTTP</option></Select></label>{field('remote_id', 'Remote / TeamViewer ID', 'Optional')}</div>}
    <label className="flex items-center justify-between rounded-xl border bg-[rgb(var(--surface)/.42)] p-4"><span><b className="block text-sm">Show on monitoring dashboard</b><small className="text-[rgb(var(--muted))]">Ping this device continuously and display its live status.</small></span><Switch checked={visible} onCheckedChange={(checked) => setValue('is_dashboard_visible', checked, { shouldDirty: true })} /></label>
    <div className="flex justify-end"><Button disabled={saving || branches.length === 0}>{saving ? 'Saving…' : value ? 'Save device' : 'Add device'}</Button></div>
  </form>
}
