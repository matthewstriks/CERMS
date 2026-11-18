import { describe, expect, it } from 'vitest'
import { permissionDefinitions } from '../src/domain/staff-permissions'
import {
  findSupportArticles,
  maxSupportArticleContext,
  supportArticles,
} from '../src/main/support-knowledge'

describe('bundled support documentation', () => {
  it('covers each feature area with complete, uniquely identified process guides and all staff permission labels', () => {
    const required = [
      'getting-started',
      'service-status',
      'app-details',
      'login',
      'account-name',
      'account-email',
      'account-password',
      'business-access',
      'theme-sounds',
      'members-search',
      'member-new',
      'member-duplicates',
      'member-edit',
      'member-delete',
      'notes',
      'member-dna',
      'member-note-review',
      'member-files',
      'member-history',
      'checkout',
      'payments',
      'order-recovery',
      'group-orders',
      'renewal',
      'waivers-payouts',
      'tax',
      'receipt',
      'receipt-email',
      'refunds',
      'refund-services',
      'discount-apply',
      'discount-manage',
      'rental',
      'rental-edit',
      'rental-renewal',
      'rental-checkout',
      'overview',
      'products',
      'categories',
      'product-images',
      'inventory-emails',
      'register',
      'register-close',
      'register-manager',
      'cash-drop',
      'register-ledger',
      'register-print',
      'staff-create',
      'permissions',
      'staff-management',
      'messages',
      'message-history',
      'reports',
      'report-sales',
      'report-members-rentals',
      'report-registers',
      'report-export',
      'daily-email',
      'updates',
      'installation',
      'installation-email',
      'local-ai',
      'assistant-remove',
      'ai-conversations',
      'support-tickets',
      'support-attachments',
      'connection',
      'feature-limits',
    ]
    expect(new Set(supportArticles.map((a) => a.id)).size).toBe(supportArticles.length)
    expect(supportArticles.map((a) => a.id)).toEqual(expect.arrayContaining(required))
    for (const article of supportArticles) {
      expect(article.title.length, article.id).toBeLessThanOrEqual(120)
      expect(article.text.length, article.id).toBeGreaterThan(700)
      expect(article.text.length, article.id).toBeLessThan(3000)
      expect(article.text, article.id).toMatch(/(?:^|\n)1\. /)
      expect(article.text, article.id).not.toMatch(
        /serviceAccount|private_key|databases\/\(default\)|github_pat_|ghp_/,
      )
    }
    const permissions = supportArticles.find((a) => a.id === 'permissions')!.text
    for (const { label } of permissionDefinitions) expect(permissions).toContain(label)
  })
  it('retrieves the right guide for new features and day-to-day support processes', () => {
    const questions: [string, string][] = [
      ['How do I remove the CERMS Assistant model download?', 'assistant-remove'],
      ['Why are the login Services indicators yellow?', 'service-status'],
      ['Where can I copy app details and see the version?', 'app-details'],
      ['How do I refund part of a sale?', 'refunds'],
      ['Can I keep a rental active when refunding it?', 'refund-services'],
      ['How do I create a percentage discount for selected categories?', 'discount-manage'],
      ['Why is my coupon expired when I apply it?', 'discount-apply'],
      ['How do I upload a PDF to a member profile?', 'member-files'],
      ['Member may already exist: how do I use the duplicate?', 'member-duplicates'],
      ['How do I change another staff member profile email?', 'staff-management'],
      ['How do I change my own login email and verify it?', 'account-email'],
      ['How do I change my password while signed in?', 'account-password'],
      ['How do I change my own display name?', 'account-name'],
      ['How do I grant staff refund permissions?', 'permissions'],
      ['How do I configure multiple low inventory email recipients?', 'inventory-emails'],
      ['How do I preview the error notification sound?', 'theme-sounds'],
      ['How do I email a receipt to an edited address?', 'receipt-email'],
      ['How do I print a recipet on the Rongta RP326?', 'receipt'],
      ['What do I do with an uncertain pending sale after losing connection?', 'order-recovery'],
      ['How do I record a cash drop?', 'cash-drop'],
      ['How do I close another cashier register?', 'register-manager'],
      ['How do I print a register closeout report?', 'register-print'],
      ['How do I extend an existing membership expiration?', 'renewal'],
      ['How do I change a rental room number?', 'rental-edit'],
      ['How do I renew an active rental?', 'rental-renewal'],
      ['How do I check out a rental and confirm returned items?', 'rental-checkout'],
      ['How do I clear Do not admit DNA?', 'member-dna'],
      ['Why do I have to confirm read member notes again?', 'member-note-review'],
      ['How do I search older message history?', 'message-history'],
      ['How do I export every report row to CSV for Excel?', 'report-export'],
      ['When is the daily morning report email sent?', 'daily-email'],
      ['How do I install and download the Ollama AI model?', 'local-ai'],
      ['Who receives my AI conversation when I close the support window?', 'ai-conversations'],
      ['Does a support ticket create a GitHub issue?', 'support-tickets'],
      ['How do I check for updates on my Mac?', 'updates'],
    ]
    for (const [question, id] of questions) {
      const result = findSupportArticles(question)
      expect.soft(result[0]?.id, `${question}: ${result.map((a) => a.id).join(', ')}`).toBe(id)
      expect(result.length).toBeLessThanOrEqual(3)
      expect(
        result.reduce((n, a) => n + a.title.length + a.text.length + 2, 0),
      ).toBeLessThanOrEqual(maxSupportArticleContext)
    }
  })
  it('keeps topic changes ahead of prior chat, preserves complete steps and has an honest unknown fallback', () => {
    expect(
      findSupportArticles('How do I upload a member PDF?', 'How do I print receipts?')[0]?.id,
    ).toBe('member-files')
    expect(findSupportArticles('quantum penguins astronomy')).toEqual([])
    const content = (id: string) => supportArticles.find((a) => a.id === id)!.text
    expect(content('member-new')).toContain('Member-file uploads are available')
    expect(content('refunds')).toContain('Return / refund')
    expect(content('rental-checkout')).toContain('does not itself add an overdue fee')
    expect(content('support-tickets')).toContain('requires the owner')
    expect(content('staff-management')).toContain('legacy CERMS account remain intact')
    expect(content('receipt-email')).toContain('does not edit the member')
  })
})
