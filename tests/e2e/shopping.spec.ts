// End-to-end journeys against a running store (local dev server or a deployed
// URL via E2E_BASE_URL). Orders created here are demo orders from a fresh
// browser; the journey cancels its own order so stock returns.
import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

test('shopper: variant stock → cart → checkout → simulated QPay → demo admin → cancel returns stock', async ({ page }) => {
  await page.goto('/products/oversized-hoodie?color=grey-marl')
  await expect(page.getByRole('heading', { level: 1, name: 'Оверсайз hoodie' })).toBeVisible()

  // Size selection reveals live stock for that exact colour × size.
  await page.getByRole('radio', { name: /^M —/ }).click()
  const stockLine = page.getByText(/үлдэгдэл \d+ ширхэг|ердөө \d+ ширхэг/)
  await expect(stockLine).toBeVisible()
  const before = Number((await stockLine.textContent())!.match(/(\d+) ширхэг/)![1])

  await page.getByRole('button', { name: 'Сагсанд нэмэх' }).click()
  const drawer = page.getByRole('dialog', { name: /Сагс/ })
  await expect(drawer.getByText('Оверсайз hoodie', { exact: true })).toBeVisible()
  await expect(drawer.getByText('219,000₮').first()).toBeVisible()
  await drawer.getByRole('link', { name: 'Захиалах', exact: true }).click()

  await expect(page).toHaveURL(/\/checkout$/)
  await expect(page.getByText('Энэ бол демо захиалга')).toBeVisible()
  // Required fields are enforced on the server.
  await page.getByRole('button', { name: 'Захиалга баталгаажуулах' }).click()
  await expect(page.getByRole('alert').first()).toBeVisible()
  await page.getByRole('button', { name: 'Жишээ мэдээлэл бөглөх' }).click()
  await page.getByLabel(/портфолио демо бөгөөд/).check()
  await page.getByRole('button', { name: 'Захиалга баталгаажуулах' }).click()

  await expect(page).toHaveURL(/\/orders\/MN-\d+/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Төлбөрөө хийнэ үү' })).toBeVisible()
  await page.getByRole('button', { name: /Туршилтын төлбөр хийх/ }).click()
  await expect(page.getByText('Туршилтын QPay төлбөр бүртгэгдсэн. Бодит мөнгө шилжээгүй.')).toBeVisible({ timeout: 20_000 })

  // The order is now in the (demo) admin — reserved stock shows in the ledger.
  await page.getByRole('button', { name: /Удирдлагын самбарт харах/ }).click()
  await expect(page).toHaveURL(/\/admin\/orders\/[0-9a-f-]{36}/, { timeout: 30_000 })
  await expect(page.getByText('Захиалгад нөөцөлсөн')).toBeVisible()
  await expect(page.getByText(`→ ${before - 1}`)).toBeVisible()

  await page.getByRole('button', { name: 'Бэлтгэж эхлэх' }).click()
  await expect(page.getByText('Төлөв шинэчлэгдлээ.')).toBeVisible()
  await page.getByRole('button', { name: 'Цуцлах' }).click()
  await page.getByLabel('Цуцлах шалтгаан').fill('E2E: үлдэгдэл буцах эсэхийг шалгав')
  await page.getByRole('button', { name: 'Захиалга цуцлах' }).click()
  await expect(page.getByText('Цуцлагдсан захиалгаас буцсан')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(`→ ${before}`)).toBeVisible()
})

test('catalogue filters by colour, size and stock on the same variant', async ({ page }) => {
  await page.goto('/shop?color=black&size=L&stock=1')
  await expect(page.getByRole('status').filter({ hasText: /\d+ бараа/ })).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: 'Оверсайз hoodie' })).toBeVisible()
  await page.goto('/shop/outerwear?sort=price-asc')
  await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible()
  const names = await page.getByRole('heading', { level: 3 }).allTextContents()
  expect(names[0]).toBe('Дулаалгатай хантааз')
})

test('assistant answers stock questions from the database', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Худалдааны туслах нээх' }).click()
  await page.getByLabel('Асуулт').fill('Хар hoodie L размер байгаа юу?')
  await page.getByRole('button', { name: 'Илгээх' }).click()
  await expect(page.getByLabel('Худалдааны туслах').getByText(/Хар, L: .*ширхэг|дууссан/)).toBeVisible({ timeout: 30_000 })
})

test('admin is closed to anonymous visitors and read-only for the public demo', async ({ page }) => {
  await page.goto('/admin/orders')
  await expect(page).toHaveURL(/\/admin\/login/)
  await page.getByRole('button', { name: 'Демо горимоор нэвтрэх' }).click()
  await expect(page).toHaveURL(/\/admin\/orders/)
  await page.goto('/admin/products')
  await page.getByRole('link', { name: /Ноолууран свитер/ }).click()
  await expect(page.getByText(/Демо горимд энэ үйлдэл хаалттай/)).toBeVisible()
  await expect(page.locator('#p-name')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Хадгалах' })).toBeDisabled()
  await page.goto('/admin/settings')
  await expect(page.getByText('Демо горимд тохиргоог зөвхөн харна.')).toBeVisible()
})

test('mobile: menu, product page and cart work at phone width @mobile', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Цэс нээх' }).click()
  await expect(page.getByRole('dialog', { name: 'Цэс' }).getByRole('link', { name: 'Бүх бараа' })).toBeVisible()
  await page.goto('/products/essential-cotton-tee')
  await page.getByRole('radio', { name: /^M —/ }).click()
  await page.getByRole('button', { name: 'Сагсанд нэмэх' }).click()
  await expect(page.getByRole('dialog', { name: /Сагс/ }).getByText('Суурь хөвөн футболк', { exact: true })).toBeVisible()
})
