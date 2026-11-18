import { memberFiles as memberFilesHandler } from './member-files.mjs'
import { discountCodes as discountCodesHandler } from './discounts.mjs'
import { refundSale as refundSaleHandler } from './refunds.mjs'
import { accountSettings as accountSettingsHandler } from './account-settings.mjs'
import { getStorage } from 'firebase-admin/storage'
import { uploadImage, getImage } from './product-images.mjs'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import {
  inventoryEmailSettings as inventoryEmailSettingsHandler,
  notifyInventory,
  inventorySettingsWritten,
} from './inventory-email.mjs'
import { createAccount } from './staff-account.mjs'
import { manageStaffAccounts as manageStaffAccountsHandler } from './staff-management.mjs'
import {
  submitBugReport as submitBugReportHandler,
  submitLoginSupport as submitLoginSupportHandler,
} from './bug-report.mjs'
import { sendSaleReceipt as sendSaleReceiptHandler } from './receipt-email.mjs'
import { defineSecret } from 'firebase-functions/params'
import nodemailer from 'nodemailer'
import { createGithubIssues } from './github-issues.mjs'
const supportSmtp = defineSecret('CERMS5_SUPPORT_SMTP')
const supportGithub = defineSecret('CERMS5_GITHUB_ISSUES_TOKEN')
const app = initializeApp({ projectId: 'cerms-7af24' })
const db = getFirestore(app, 'cerms')
import { emailAiSupportConversation as emailAiSupportConversationHandler } from './ai-conversation-email.mjs'
import { reportInstallation as reportInstallationHandler } from './installation.mjs'
export const inventoryEmailSettings = onCall(
  {
    region: 'us-central1',
    maxInstances: 3,
    timeoutSeconds: 60,
    serviceAccount: 'cerms5-support@cerms-7af24.iam.gserviceaccount.com',
  },
  (request) =>
    inventoryEmailSettingsHandler(request, {
      db,
      timestamp: () => FieldValue.serverTimestamp(),
      fail: (code, message) => {
        throw new HttpsError(code, message)
      },
    }),
)
function inventoryTrigger(document, handler) {
  return onDocumentWritten(
    {
      document,
      database: 'cerms',
      region: 'us-central1',
      maxInstances: 3,
      concurrency: 4,
      timeoutSeconds: 540,
      memory: '256MiB',
      retry: true,
      serviceAccount: 'cerms5-support@cerms-7af24.iam.gserviceaccount.com',
      secrets: [supportSmtp],
    },
    async (event) => {
      if (event.database !== 'cerms')
        throw Error('Inventory notifications require the named cerms database.')
      let transport
      try {
        await handler(event, {
          db,
          timestamp: () => FieldValue.serverTimestamp(),
          send: async (message) => {
            if (!transport) {
              const options = JSON.parse(supportSmtp.value())
              transport = nodemailer.createTransport({
                ...options,
                requireTLS: !options.secure,
                tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
                connectionTimeout: 15000,
                greetingTimeout: 15000,
                socketTimeout: 30000,
                disableFileAccess: true,
                disableUrlAccess: true,
                logger: false,
                debug: false,
              })
            }
            return transport.sendMail(message)
          },
        })
      } finally {
        transport?.close()
      }
    },
  )
}
export const inventoryProductWritten = inventoryTrigger(
  'system/{business}/products/{productId}',
  (event, deps) =>
    notifyInventory(
      {
        business: event.params.business,
        productId: event.params.productId,
        before: event.data?.before,
        after: event.data?.after,
      },
      deps,
    ),
)
export const inventoryEmailSettingsWritten = inventoryTrigger(
  'system/{business}/inventoryEmailSettings/config',
  (event, deps) => inventorySettingsWritten(event.params.business, deps),
)
export const emailAiSupportConversation = onCall(
  {
    region: 'us-central1',
    maxInstances: 3,
    concurrency: 4,
    timeoutSeconds: 90,
    memory: '256MiB',
    serviceAccount: 'cerms5-support@cerms-7af24.iam.gserviceaccount.com',
    secrets: [supportSmtp],
  },
  async (request) => {
    let transport
    try {
      return await emailAiSupportConversationHandler(request, {
        db,
        timestamp: () => FieldValue.serverTimestamp(),
        fail: (code, message) => {
          throw new HttpsError(code, message)
        },
        send: async (message) => {
          const options = JSON.parse(supportSmtp.value())
          transport = nodemailer.createTransport({
            ...options,
            requireTLS: !options.secure,
            tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 30000,
            disableFileAccess: true,
            disableUrlAccess: true,
            logger: false,
            debug: false,
          })
          return transport.sendMail(message)
        },
      })
    } catch (error) {
      if (error instanceof HttpsError) throw error
      throw new HttpsError('unavailable', 'AI conversation email is pending.')
    } finally {
      transport?.close()
    }
  },
)
export const reportInstallation = onCall(
  {
    region: 'us-central1',
    maxInstances: 3,
    concurrency: 4,
    timeoutSeconds: 90,
    memory: '256MiB',
    serviceAccount: 'cerms5-support@cerms-7af24.iam.gserviceaccount.com',
    secrets: [supportSmtp],
  },
  async (request) => {
    let transport
    try {
      return await reportInstallationHandler(request, {
        db,
        timestamp: () => FieldValue.serverTimestamp(),
        fail: (code, message) => {
          throw new HttpsError(code, message)
        },
        send: async (message) => {
          const options = JSON.parse(supportSmtp.value())
          transport = nodemailer.createTransport({
            ...options,
            requireTLS: !options.secure,
            tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 30000,
            disableFileAccess: true,
            disableUrlAccess: true,
            logger: false,
            debug: false,
          })
          return transport.sendMail(message)
        },
      })
    } catch (error) {
      if (error instanceof HttpsError) throw error
      throw new HttpsError('unavailable', 'Installation confirmation is pending.')
    } finally {
      transport?.close()
    }
  },
)
export const sendSaleReceipt = onCall(
  {
    region: 'us-central1',
    maxInstances: 3,
    concurrency: 4,
    timeoutSeconds: 90,
    memory: '256MiB',
    serviceAccount: 'cerms5-support@cerms-7af24.iam.gserviceaccount.com',
    secrets: [supportSmtp],
  },
  async (request) => {
    let transport
    try {
      return await sendSaleReceiptHandler(request, {
        db,
        timestamp: () => FieldValue.serverTimestamp(),
        fail: (code, message) => {
          throw new HttpsError(code, message)
        },
        send: async (message) => {
          const options = JSON.parse(supportSmtp.value())
          transport = nodemailer.createTransport({
            ...options,
            requireTLS: !options.secure,
            tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 30000,
            disableFileAccess: true,
            disableUrlAccess: true,
            logger: false,
            debug: false,
          })
          return transport.sendMail(message)
        },
      })
    } catch (error) {
      if (error instanceof HttpsError) throw error
      throw new HttpsError(
        'unavailable',
        'Receipt email could not be confirmed. The order is saved; you can still print it.',
      )
    } finally {
      transport?.close()
    }
  },
)
export const memberFiles = onCall(
  {
    region: 'us-central1',
    maxInstances: 3,
    concurrency: 2,
    memory: '512MiB',
    timeoutSeconds: 300,
    serviceAccount: 'cerms5-support@cerms-7af24.iam.gserviceaccount.com',
  },
  (request) =>
    memberFilesHandler(request, {
      db,
      bucket: getStorage(app).bucket('cerms-7af24-cerms5-member-files'),
      timestamp: () => FieldValue.serverTimestamp(),
      fail: (code, message) => {
        throw new HttpsError(code, message)
      },
    }),
)
export const discountCodes = onCall(
  {
    region: 'us-central1',
    maxInstances: 3,
    timeoutSeconds: 60,
    serviceAccount: 'cerms5-support@cerms-7af24.iam.gserviceaccount.com',
  },
  (request) =>
    discountCodesHandler(request, {
      db,
      timestamp: () => FieldValue.serverTimestamp(),
      fail: (code, message) => {
        throw new HttpsError(code, message)
      },
    }),
)
export const refundSale = onCall(
  {
    region: 'us-central1',
    maxInstances: 3,
    timeoutSeconds: 60,
    serviceAccount: 'cerms5-support@cerms-7af24.iam.gserviceaccount.com',
  },
  (request) =>
    refundSaleHandler(request, {
      db,
      timestamp: () => FieldValue.serverTimestamp(),
      fail: (code, message) => {
        throw new HttpsError(code, message)
      },
    }),
)
export const accountSettings = onCall(
  {
    region: 'us-central1',
    maxInstances: 3,
    timeoutSeconds: 60,
    serviceAccount: 'cerms5-support@cerms-7af24.iam.gserviceaccount.com',
  },
  (request) =>
    accountSettingsHandler(request, {
      db,
      fail: (code, message) => {
        throw new HttpsError(code, message)
      },
    }),
)
export const manageStaffAccounts = onCall(
  {
    region: 'us-central1',
    maxInstances: 3,
    timeoutSeconds: 60,
    serviceAccount: 'cerms5-support@cerms-7af24.iam.gserviceaccount.com',
  },
  (request) =>
    manageStaffAccountsHandler(request, {
      db,
      timestamp: () => FieldValue.serverTimestamp(),
      fail: (code, message) => {
        throw new HttpsError(code, message)
      },
    }),
)
export const createStaffAccount = onCall(
  { region: 'us-central1', maxInstances: 3, timeoutSeconds: 60 },
  async (request) => {
    try {
      return await createAccount(request, {
        db,
        auth: getAuth(app),
        timestamp: () => FieldValue.serverTimestamp(),
        fail: (code, message) => {
          throw new HttpsError(code, message)
        },
      })
    } catch (error) {
      if (error instanceof HttpsError) throw error
      // Do not log passwords, tokens or request bodies.
      throw new HttpsError(
        'unavailable',
        'Account setup was not confirmed. Retry with the same details; do not change the email or password.',
      )
    }
  },
)

const productImageDependencies = {
  db,
  bucket: getStorage(app).bucket('cerms-7af24-cerms5-product-images'),
  fail: (code, message) => {
    throw new HttpsError(code, message)
  },
}
function imageHandler(handler) {
  return onCall(
    {
      region: 'us-central1',
      maxInstances: 3,
      concurrency: 8,
      memory: '512MiB',
      timeoutSeconds: 60,
    },
    async (request) => {
      try {
        return await handler(request, productImageDependencies)
      } catch (error) {
        if (error instanceof HttpsError) throw error
        throw new HttpsError(
          'unavailable',
          'Product image could not be saved or loaded. Retry when connected.',
        )
      }
    },
  )
}
export const uploadProductImage = imageHandler(uploadImage)
export const getProductImage = imageHandler(getImage)

function supportHandler(handler) {
  return onCall(
    {
      region: 'us-central1',
      maxInstances: 3,
      timeoutSeconds: 120,
      memory: '512MiB',
      serviceAccount: 'cerms5-support@cerms-7af24.iam.gserviceaccount.com',
      concurrency: 4,
      secrets: [supportSmtp, supportGithub],
    },
    async (request) => {
      let transport
      try {
        return await handler(request, {
          github: createGithubIssues(supportGithub.value()),
          db,
          bucket: getStorage(app).bucket('cerms-7af24-cerms5-bug-reports'),
          send: async (message) => {
            const options = JSON.parse(supportSmtp.value())
            transport = nodemailer.createTransport({
              ...options,
              requireTLS: !options.secure,
              tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
              connectionTimeout: 15000,
              greetingTimeout: 15000,
              socketTimeout: 30000,
              disableFileAccess: true,
              disableUrlAccess: true,
              logger: false,
              debug: false,
            })
            return transport.sendMail(message)
          },
          timestamp: () => FieldValue.serverTimestamp(),
          fail: (code, message) => {
            throw new HttpsError(code, message)
          },
        })
      } catch (error) {
        if (error instanceof HttpsError) throw error
        throw new HttpsError(
          'unavailable',
          'Bug report could not be sent. Retry without changing the report details.',
        )
      } finally {
        transport?.close()
      }
    },
  )
}
export const submitBugReport = supportHandler(submitBugReportHandler)
export const submitLoginSupport = supportHandler(submitLoginSupportHandler)

import {
  checkOutRental as checkOutRentalHandler,
  updateRental as updateRentalHandler,
  completeSale as completeSaleHandler,
  savePosSettings as savePosSettingsHandler,
  cashDrop as cashDropHandler,
} from './pos.mjs'
const posDependencies = {
  db,
  timestamp: () => FieldValue.serverTimestamp(),
  fail: (code, message) => {
    throw new HttpsError(code, message)
  },
}
function posHandler(handler) {
  return onCall({ region: 'us-central1', maxInstances: 3, timeoutSeconds: 60 }, async (request) => {
    try {
      return await handler(request, posDependencies)
    } catch (error) {
      if (error instanceof HttpsError) throw error
      throw new HttpsError(
        'unavailable',
        'Save was not confirmed. Retry this same sale request before starting another sale.',
      )
    }
  })
}
export const completeSale = posHandler(completeSaleHandler)
export const savePosSettings = posHandler(savePosSettingsHandler)
export const cashDrop = posHandler(cashDropHandler)

export const updateRental = posHandler(updateRentalHandler)

import { saveThemePreference as saveThemeHandler } from './theme.mjs'
export const saveThemePreference = onCall(
  { region: 'us-central1', maxInstances: 3, timeoutSeconds: 30 },
  async (request) => {
    try {
      return await saveThemeHandler(request, {
        db,
        fail: (code, message) => {
          throw new HttpsError(code, message)
        },
      })
    } catch (error) {
      if (error instanceof HttpsError) throw error
      throw new HttpsError(
        'unavailable',
        'Appearance could not be confirmed. Try again when connected.',
      )
    }
  },
)

export const checkOutRental = onCall(
  { region: 'us-central1', maxInstances: 3, timeoutSeconds: 60 },
  async (request) => {
    try {
      return await checkOutRentalHandler(request, posDependencies)
    } catch (error) {
      if (error instanceof HttpsError) throw error
      throw new HttpsError(
        'unavailable',
        'Rental checkout was not confirmed. Retry the same checkout.',
      )
    }
  },
)

import { memberNotes as memberNotesHandler } from './member-notes.mjs'
export const memberNotes = onCall(
  { region: 'us-central1', maxInstances: 3, timeoutSeconds: 60 },
  async (request) => {
    try {
      return await memberNotesHandler(request, posDependencies)
    } catch (error) {
      if (error instanceof HttpsError) throw error
      throw new HttpsError(
        'unavailable',
        'Member note request was not confirmed. Retry the same request.',
      )
    }
  },
)

import { staffMessaging as staffMessagingHandler } from './staff-messaging.mjs'
export const staffMessaging = onCall(
  { region: 'us-central1', maxInstances: 3, timeoutSeconds: 60 },
  async (request) => {
    try {
      return await staffMessagingHandler(request, posDependencies)
    } catch (error) {
      if (error instanceof HttpsError) throw error
      throw new HttpsError(
        'unavailable',
        'Messaging request was not confirmed. Retry the same request.',
      )
    }
  },
)

import { saveNotificationSoundPreference as saveNotificationSoundHandler } from './notification-sounds.mjs'
export const saveNotificationSoundPreference = onCall(
  { region: 'us-central1', maxInstances: 3, timeoutSeconds: 30 },
  async (request) => {
    try {
      return await saveNotificationSoundHandler(request, {
        db,
        fail: (code, message) => {
          throw new HttpsError(code, message)
        },
      })
    } catch (error) {
      if (error instanceof HttpsError) throw error
      throw new HttpsError(
        'unavailable',
        'Sound preferences could not be confirmed. Try again when connected.',
      )
    }
  },
)
