import type { Metadata } from 'next'
import { AssistantSettingsForm } from '@/components/admin/assistant/settings-form'
import { ModeBadge, Notice } from '@/components/admin/assistant/ui'
import { Card, dateTime, PageHeader } from '@/components/admin/ui'
import { hasPermission } from '@/lib/roles'
import { requireAdminPage } from '@/server/auth/current'
import { getAssistantSettings, getAssistantStatus } from '@/server/queries/assistant-admin'

export const metadata: Metadata = { title: 'Чатботын тохиргоо' }

export default async function AssistantSettingsPage() {
  const actor = await requireAdminPage('/admin/assistant/settings', 'assistant.view')
  const [{ settings, updatedAt }, status] = await Promise.all([getAssistantSettings(), getAssistantStatus()])
  const readOnly = !hasPermission(actor.role, 'assistant.manage')
  return (
    <>
      <PageHeader title="Чатботын тохиргоо" description="Туслах хэрхэн ажиллахыг энгийн үгээр тохируулна. Өөрчлөлт дараагийн мессежээс хэрэгжинэ." />
      {readOnly && <Notice>Демо горимд тохиргоог зөвхөн харна.</Notice>}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <ModeBadge mode={status.mode} />
          <span>{status.reason}</span>
          {updatedAt && <span className="text-stone-500">· Сүүлд өөрчилсөн {dateTime.format(updatedAt)}</span>}
        </div>
        <p className="mt-2 text-[12px] text-stone-500">
          OpenAI түлхүүр зөвхөн серверийн орчны хувьсагчид (OPENAI_API_KEY) хадгалагдана — энд харагдахгүй, засагдахгүй. Түлхүүр: {status.configured ? 'тохируулсан' : 'тохируулаагүй'}.
        </p>
      </Card>
      <Card>
        <AssistantSettingsForm initial={settings} readOnly={readOnly} aiConfigured={status.configured} />
      </Card>
    </>
  )
}
