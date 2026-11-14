// Fixed allowlist. Do not discover/report other businesses or legacy databases.
export const reportConfig = Object.freeze({
  project: 'cerms-7af24',
  database: 'cerms',
  business: 'dev',
  recipient: 'matthew@rocmtssolutions.com',
  from: 'system@rocmtssolutions.com',
  replyTo: 'support@rocmtssolutions.com',
  timeZone: 'America/Chicago',
  schedule: '0 7 * * *',
  serviceAccount: 'cerms5-reports@cerms-7af24.iam.gserviceaccount.com',
  smtpSecret: 'CERMS5_REPORT_SMTP',
})
