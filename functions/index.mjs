import { getStorage } from 'firebase-admin/storage'
import { uploadImage, getImage } from './product-images.mjs'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { createAccount } from './staff-account.mjs'
const app = initializeApp({ projectId: 'cerms-7af24' })
const db = getFirestore(app, 'cerms')
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

import {
  completeSale as completeSaleHandler,
  savePosSettings as savePosSettingsHandler,
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
