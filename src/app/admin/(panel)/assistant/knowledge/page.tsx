import type { Metadata } from 'next'
import Link from 'next/link'
import { FaqEditor } from '@/components/admin/assistant/faq-editor'
import { Notice } from '@/components/admin/assistant/ui'
import { Card, PageHeader, Stat } from '@/components/admin/ui'
import { formatMoney } from '@/lib/money'
import { hasPermission } from '@/lib/roles'
import { requireAdminPage } from '@/server/auth/current'
import { getKnowledge } from '@/server/queries/assistant-admin'

export const metadata: Metadata = { title: 'Мэдлэг' }

export default async function KnowledgePage() {
  const actor = await requireAdminPage('/admin/assistant/knowledge', 'assistant.view')
  const k = await getKnowledge()
  const readOnly = !hasPermission(actor.role, 'assistant.manage')
  return (
    <>
      <PageHeader
        title="Мэдлэг"
        description="Туслах юуг уншиж хариулдаг вэ. Бараа, үнэ, өнгө, хэмжээ, үлдэгдэл нь «Бүтээгдэхүүн», «Үлдэгдэл» хэсгээс, нөхцөл, хүргэлт нь «Тохиргоо»-оос шууд уншигдана — энд давхардуулж засахгүй."
      />
      {readOnly && <Notice>Демо горимд мэдлэгийг зөвхөн харна. Эзэмшигч, менежер асуулт хариулт нэмж засна.</Notice>}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Нийтлэгдсэн бараа" value={k.products.count} hint={`${k.products.colors} өнгө`} />
        <Stat label="Хувилбар (өнгө × хэмжээ)" value={k.products.variants} hint={`${k.products.soldOutVariants} нь дууссан`} />
        <Stat label="Үлдэгдэл (нийт ширхэг)" value={k.products.units} />
        <Stat label="Эзэмшигчийн асуулт, хариулт" value={k.faqs.filter((f) => f.enabled).length} hint={`${k.faqs.length} бүгд`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Бүтээгдэхүүний мэдээлэл (сангаас шууд)">
          <p className="text-[13px] text-stone-600">
            Үнэ, хувилбарын үнэ, үлдэгдэл, материал, арчилгаа, хэлбэрийг туслах мессеж бүрт сангаас дахин уншина. Өөрчлөлт дараагийн хариултад шууд орно.
          </p>
          {k.products.missing.length > 0 ? (
            <div className="mt-3">
              <p className="text-[12.5px] font-medium text-warning">Мэдээлэл дутуу бараа — туслах эдгээрийг «мэдээлэл алга» гэж хэлнэ:</p>
              <ul className="mt-1 space-y-1 text-[13px]">
                {k.products.missing.map((p) => (
                  <li key={p.id}>
                    <Link href={`/admin/products/${p.id}`} className="underline underline-offset-2">
                      {p.name}
                    </Link>{' '}
                    — {p.gaps.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-success">Бүх бараанд материал, арчилгаа, хэлбэр, зураг бүртгэлтэй.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3 text-[13px]">
            <Link href="/admin/products" className="underline underline-offset-2">
              Бүтээгдэхүүн засах
            </Link>
            <Link href="/admin/inventory" className="underline underline-offset-2">
              Үлдэгдэл засах
            </Link>
          </div>
        </Card>
        <Card title="Нөхцөл, хүргэлт, хэмжээний хүснэгт">
          <ul className="space-y-1.5 text-[13px]">
            {k.policies.map((p) => (
              <li key={p.key}>
                {p.title} <span className="text-stone-500">· {p.paragraphs} догол мөр</span>
              </li>
            ))}
          </ul>
          <ul className="mt-3 space-y-1.5 border-t border-stone-100 pt-3 text-[13px]">
            {k.shipping.map((m) => (
              <li key={m.id} className={m.isActive ? '' : 'text-stone-400 line-through'}>
                {m.name} — {m.fee === 0 ? 'үнэгүй' : formatMoney(m.fee)}
                {m.freeThreshold ? ` (${formatMoney(m.freeThreshold)}-өөс дээш үнэгүй)` : ''}, {m.eta}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-stone-100 pt-3 text-[13px]">
            Хэмжээний хүснэгт: {k.sizeGuide ? `${k.sizeGuide.rows} мөр` : 'үндсэн хүснэгт'}. Туслах өндөр, жингээр хэмжээ таамаглахгүй — зөвхөн энэ хүснэгт, барааны хэлбэрээр зөвлөнө.
          </p>
          <Link href="/admin/settings" className="mt-3 inline-block text-[13px] underline underline-offset-2">
            Тохиргоонд засах
          </Link>
        </Card>
      </div>

      <Card title="Эзэмшигчийн асуулт, хариулт" className="mt-4">
        <p className="mb-4 text-[13px] text-stone-600">
          Дэлгүүрийн тухай давтагддаг асуулт (шоурум, бэлгийн карт гэх мэт). Асуулт тохирвол туслах хариултыг үгчлэн хэлнэ. Үнэ, үлдэгдлийг энд бичихгүй — тэдгээр бараанаас шууд уншигдана.
        </p>
        <FaqEditor faqs={k.faqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer, enabled: f.enabled, sortOrder: f.sortOrder }))} readOnly={readOnly} />
      </Card>
    </>
  )
}
