import { describe, expect, it } from 'vitest'
import { allowFirebaseRequest, isMemberFileUrl } from '../src/shared/firebase-policy'
import { dobVariants, nameVariants } from '../src/data/membership-search'
import { memberFromLegacy } from '../src/domain/legacy'
import { readFileSync } from 'node:fs'

const documents =
  'https://firestore.googleapis.com/v1/projects/cerms-7af24/databases/cerms/documents'
describe('Firebase write protection', () => {
  it('allows only the existing database read RPCs', () => {
    expect(allowFirebaseRequest(documents + ':batchGet', 'POST')).toBe(true)
    expect(allowFirebaseRequest(documents + ':runQuery', 'POST')).toBe(true)
    for (const database of ['(default)', 'another-database'])
      for (const rpc of [':batchGet', ':runQuery'])
        expect(
          allowFirebaseRequest(documents.replace('/cerms/', `/${database}/`) + rpc, 'POST'),
        ).toBe(false)
    expect(
      allowFirebaseRequest(
        documents.replace('cerms-7af24', 'another-project') + ':runQuery',
        'POST',
      ),
    ).toBe(false)
  })
  it('blocks every Firestore mutation path without sending requests', () => {
    for (const rpc of [
      ':commit',
      ':batchWrite',
      ':write',
      ':beginTransaction',
      ':rollback',
      '/members',
      '/members/test',
    ]) {
      for (const method of ['POST', 'PATCH', 'DELETE', 'PUT'])
        expect(allowFirebaseRequest(documents + rpc, method)).toBe(false)
    }
    expect(
      allowFirebaseRequest(
        'https://firestore.googleapis.com/google.firestore.v1.Firestore/Write/channel',
        'POST',
      ),
    ).toBe(false)
    expect(allowFirebaseRequest('https://cerms-7af24.firebaseio.com/members.json', 'PUT')).toBe(
      false,
    )
    expect(
      allowFirebaseRequest(
        'https://firebasestorage.googleapis.com/v0/b/cerms-7af24.appspot.com/o',
        'POST',
      ),
    ).toBe(false)
  })
  it('permits existing-account sign-in but blocks account creation and account changes', () => {
    const base = 'https://identitytoolkit.googleapis.com/v1/accounts:'
    expect(allowFirebaseRequest(base + 'signInWithPassword?key=public', 'POST')).toBe(true)
    for (const action of ['signUp', 'update', 'delete', 'sendOobCode', 'resetPassword'])
      expect(allowFirebaseRequest(base + action, 'POST')).toBe(false)
    expect(allowFirebaseRequest('https://securetoken.googleapis.com/v1/token', 'POST')).toBe(true)
    expect(allowFirebaseRequest('http://firestore.googleapis.com/v1/x', 'POST')).toBe(false)
  })
  it('allows only explicitly requested password-reset emails at the email action endpoint', () => {
    const url = 'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode'
    expect(
      allowFirebaseRequest(
        url,
        'POST',
        JSON.stringify({ requestType: 'PASSWORD_RESET', email: 'staff@example.test' }),
      ),
    ).toBe(true)
    for (const body of [
      '{}',
      'invalid',
      JSON.stringify({ requestType: 'VERIFY_EMAIL', email: 'staff@example.test' }),
      JSON.stringify({ requestType: 'PASSWORD_RESET' }),
    ])
      expect(allowFirebaseRequest(url, 'POST', body)).toBe(false)
  })
  it('restricts file opening to HTTPS attachments in the existing bucket', () => {
    expect(
      isMemberFileUrl(
        'https://firebasestorage.googleapis.com/v0/b/cerms-7af24.appspot.com/o/member-files%2Ftest.pdf?alt=media',
      ),
    ).toBe(true)
    expect(isMemberFileUrl('https://storage.googleapis.com/cerms-7af24.appspot.com/file.pdf')).toBe(
      true,
    )
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'https://storage.googleapis.com/other-bucket/file.pdf',
      'https://firebasestorage.googleapis.com.evil.test/v0/b/cerms-7af24.appspot.com/o/x',
      'https://user:pass@storage.googleapis.com/cerms-7af24.appspot.com/x',
    ])
      expect(isMemberFileUrl(url)).toBe(false)
  })
  it('keeps SDK writes and legacy login side effects out of the connection module', () => {
    const source = readFileSync('src/data/firebase-membership.ts', 'utf8')
    expect(source).not.toMatch(
      /\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction|createUserWithEmailAndPassword|updateProfile)\b/,
    )
  })
})
describe('legacy membership compatibility', () => {
  it('searches old and ISO date-of-birth representations and rejects invalid dates', () => {
    expect(dobVariants('2/9/1980')).toContain('1980-02-09')
    expect(dobVariants('1980-02-09')).toContain('02/09/1980')
    expect(() => dobVariants('02/30/1980')).toThrow()
    expect(() => dobVariants('not a date')).toThrow()
    expect(nameVariants('alex morgan')).toEqual(['alex morgan', 'ALEX MORGAN', 'Alex Morgan'])
  })
  it('reads the original details, old numeric creation time, and file arrays without modifying them', () => {
    const raw = {
      access: 'a',
      fname: 'Alex',
      lname: 'Morgan',
      mname: 'J',
      suffix: 'Jr',
      dob: '02/09/1980',
      idnum: '001234',
      idstate: 'TX',
      email: 'fixture@example.test',
      creation_time: 100,
      notes: 'Old note',
      files: ['https://example.test/file'],
      filesNames: ['Original file'],
      signature: 'https://example.test/signature',
    }
    const before = JSON.stringify(raw)
    expect(memberFromLegacy('id', raw, 'a')).toMatchObject({
      name: 'Alex J Morgan Jr',
      governmentId: '001234',
      governmentIdState: 'TX',
      createdAt: 100000,
      files: [
        { name: 'E-signed waiver', url: raw.signature },
        { name: 'Original file', url: raw.files[0] },
      ],
    })
    expect(JSON.stringify(raw)).toBe(before)
  })
})
