import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions'
import nodemailer from 'nodemailer'
import { reportConfig as config } from './config.mjs'
import { deliverDailyReport } from './delivery.mjs'
const app = initializeApp({ projectId: config.project })
const db = getFirestore(app, 'cerms')
const smtp = defineSecret(config.smtpSecret)

export const sendDevDailyReport = onSchedule(
  {
    region: 'us-central1',
    schedule: config.schedule,
    timeZone: config.timeZone,
    serviceAccount: config.serviceAccount,
    secrets: [smtp],
    minInstances: 0,
    maxInstances: 1,
    concurrency: 1,
    memory: '1GiB',
    timeoutSeconds: 540,
    retryCount: 3,
    minBackoffSeconds: 60,
    maxBackoffSeconds: 300,
    maxRetrySeconds: 1800,
  },
  async (event) => {
    const options = JSON.parse(smtp.value())
    const transport = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      auth: options.auth,
      requireTLS: !options.secure,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 60000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    })
    try {
      const result = await deliverDailyReport(event, {
        db,
        timestamp: () => FieldValue.serverTimestamp(),
        send: (message) => transport.sendMail(message),
      })
      if (result.state === 'needs-review')
        logger.error('Dev daily report has an unresolved prior delivery; not resending.', {
          date: result.date,
        })
      else logger.info('Dev daily report finished.', result)
    } finally {
      transport.close()
    }
  },
)
