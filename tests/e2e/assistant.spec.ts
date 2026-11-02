// The shopping assistant in a real browser: a chat order confirmed in the
// chat and paid with the simulated QPay, and a hand-over that the public demo
// admin takes over, answers and hands back. Run against a local server on the
// local development database (npm run db:dev) — not against the live demo.
import { expect, test, type Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

const widget = (page: Page) => page.getByRole('region', { name: 'Худалдааны туслах' })

async function ask(page: Page, text: string) {
  const panel = widget(page)
  const before = await panel.locator('.items-start').count()
  await panel.getByLabel('Асуулт').fill(text)
  await panel.getByRole('button', { name: 'Илгээх' }).click()
  await expect(panel.getByLabel('Асуулт')).toHaveValue('')
  await expect.poll(() => panel.locator('.items-start').count(), { timeout: 30_000 }).toBeGreaterThan(before)
}

test('a chat order: priced from the database, confirmed with "тийм", created once, paid with the simulated QPay', async ({ page }) => {
  await page.goto('/products/oversized-hoodie')
  await page.getByRole('button', { name: 'Худалдааны туслах нээх' }).click()
  const panel = widget(page)
  await ask(page, 'Хар L авъя')
  await expect(panel.getByText('Оверсайз hoodie — Хар / L')).toBeVisible()
  await expect(panel.getByRole('button', { name: /Сагсанд нэмэх · Хар \/ L/ }).first()).toBeVisible()
  await ask(page, 'энд захиалъя')
  await ask(page, 'Бат 9911 2233')
  await ask(page, 'Хан-Уул, 15-р хороо, 3-р байр, 45 тоот')
  await expect(panel.getByText('Захиалгын мэдээлэл:')).toBeVisible()
  await expect(panel.getByText(/Нийт: 219,000₮/)).toBeVisible()
  await ask(page, 'тийм')
  const link = panel.getByRole('link', { name: /^Захиалга №MN-\d+$/ })
  await expect(link).toBeVisible()
  const number = (await link.textContent())!.replace('Захиалга №', '')
  // A second "тийм" does not create another order.
  await ask(page, 'тийм')
  await expect(panel.getByText(/аль хэдийн бүртгэгдсэн/)).toBeVisible()

  await link.click()
  await expect(page).toHaveURL(new RegExp(`/orders/${number}$`))
  await expect(page.getByText(/туслахаар чатаар үүсгэсэн/)).toBeVisible()
  await page.getByRole('button', { name: /Туршилтын төлбөр хийх/ }).click()
  await expect(page.getByText('Туршилтын QPay төлбөр бүртгэгдсэн. Бодит мөнгө шилжээгүй.')).toBeVisible({ timeout: 20_000 })
})

test('hand-over: the demo admin takes the chat over, replies, and hands it back', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Худалдааны туслах нээх' }).click()
  await ask(page, 'Ажилтантай холбогдмоор байна')
  await expect(widget(page).getByText('Ажилтанд мэдэгдсэн. Хүлээх хооронд надаас асууж болно.')).toBeVisible()

  // Same browser: the public demo admin sees this chat as its own.
  await page.goto('/admin/assistant/handover')
  await expect(page).toHaveURL(/\/admin\/login/)
  await page.getByRole('button', { name: 'Демо горимоор нэвтрэх' }).click()
  await expect(page).toHaveURL(/\/admin\/assistant\/handover/)
  await page.getByRole('link', { name: '«Ажилтантай холбогдмоор байна»' }).first().click()
  await expect(page).toHaveURL(/\/admin\/assistant\/conversations\/[0-9a-f-]{36}/)
  await page.getByRole('button', { name: 'Яриаг хүлээн авах' }).click()
  await expect(page.getByText('Та яриаг хүлээн авлаа')).toBeVisible()
  await page.getByLabel('Ажилтны хариулт').fill('Сайн байна уу! Би туслая.')
  await page.getByRole('button', { name: 'Илгээх' }).click()
  await expect(page.getByText('Сайн байна уу! Би туслая.').first()).toBeVisible()
  const conversationUrl = page.url()

  // The customer sees the staff reply; while a person answers, the assistant is silent.
  await page.goto('/')
  await page.getByRole('button', { name: 'Худалдааны туслах нээх' }).click()
  await expect(widget(page).getByText('Сайн байна уу! Би туслая.')).toBeVisible({ timeout: 20_000 })
  await expect(widget(page).getByText('Ажилтан холбогдсон — хариулт энд гарна.')).toBeVisible()

  await page.goto(conversationUrl)
  await page.getByRole('button', { name: 'Туслах руу буцаах' }).click()
  await expect(page.getByText('Туслах дахин хариулна.')).toBeVisible()

  await page.goto('/')
  await page.getByRole('button', { name: 'Худалдааны туслах нээх' }).click()
  await ask(page, 'Хүргэлт хэд хоног вэ?')
  await expect(widget(page).getByText(/Ажлын 1–2 өдөр/)).toBeVisible()
})

test('the AI Chatbot admin pages open for the public demo, read-only where they must be', async ({ page }) => {
  await page.goto('/admin/login')
  await page.getByRole('button', { name: 'Демо горимоор нэвтрэх' }).click()
  await expect(page).not.toHaveURL(/\/admin\/login/)
  for (const [path, heading] of [
    ['/admin/assistant', 'AI чатбот'],
    ['/admin/assistant/conversations', 'Яриа'],
    ['/admin/assistant/inquiries', 'Харилцагчийн асуулт'],
    ['/admin/assistant/handover', 'Ажилтанд шилжүүлэх'],
    ['/admin/assistant/knowledge', 'Мэдлэг'],
    ['/admin/assistant/settings', 'Чатботын тохиргоо'],
    ['/admin/assistant/analytics', 'Шинжилгээ'],
    ['/admin/assistant/usage', 'AI хэрэглээ, зардал'],
    ['/admin/assistant/activity', 'Үйл явдлын түүх'],
    ['/admin/assistant/problems', 'Асуудал, алдаа'],
    ['/admin/assistant/try', 'Чатбот турших'],
  ]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  }
  await page.goto('/admin/assistant/settings')
  await expect(page.getByText('Демо горимд тохиргоог зөвхөн харна.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Хадгалах' })).toHaveCount(0)
  await page.goto('/admin/assistant/try')
  await page.getByLabel('Туршилтын асуулт').fill('har hoodie L razmer bga yu')
  await page.getByRole('button', { name: 'Илгээх' }).click()
  await expect(page.getByText(/Хар \/ L/).first()).toBeVisible({ timeout: 20_000 })
})
