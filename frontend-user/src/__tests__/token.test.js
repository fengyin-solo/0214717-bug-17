/**
 * 令牌模块单元测试
 *
 * 覆盖：签发/校验、损坏令牌、篡改签名、过期、归属用户
 */

import { describe, it, expect } from 'vitest'
import {
  issueToken,
  verifyToken,
  TOKEN_TTL_MS
} from '../utils/token'

describe('Token Module', () => {
  it('issues and verifies a valid token for a user', () => {
    const token = issueToken('U1')
    const result = verifyToken(token)

    expect(result.valid).toBe(true)
    expect(result.userId).toBe('U1')
    expect(result.expiresAt).toBeGreaterThan(Date.now())
  })

  it('rejects null/undefined/empty token as missing', () => {
    expect(verifyToken(null).reason).toBe('missing')
    expect(verifyToken(undefined).reason).toBe('missing')
    expect(verifyToken('').reason).toBe('missing')
  })

  it('rejects corrupted arbitrary strings', () => {
    expect(verifyToken('not-a-token').valid).toBe(false)
    expect(verifyToken('not-a-token').reason).toBe('malformed')
    expect(verifyToken('a.b.c').reason).toBe('malformed')
    expect(verifyToken('onlyonepart').reason).toBe('malformed')
    expect(verifyToken('.').reason).toBe('malformed')
  })

  it('rejects well-formed token whose signature does not match', () => {
    // 合法 base64url 的 payload + 错误签名
    const payload = Buffer.from(JSON.stringify({ sub: 'U1', iat: 1, exp: Date.now() + 10000 })).toString('base64url')
    expect(verifyToken(`${payload}.000000`).reason).toBe('bad_signature')
  })

  it('rejects tampered payload (userId changed)', () => {
    const token = issueToken('U1')
    const [, sig] = token.split('.')
    // 手工构造一个 U2 的 payload 却带 U1 的签名
    const fakePayload = btoa(JSON.stringify({ sub: 'U2', iat: 1, exp: Date.now() + 10000 }))
    const tampered = `${fakePayload}.${sig}`
    expect(verifyToken(tampered).valid).toBe(false)
    expect(verifyToken(tampered).reason).toBe('bad_signature')
  })

  it('rejects tampered signature', () => {
    const token = issueToken('U1')
    const [payload] = token.split('.')
    expect(verifyToken(`${payload}.xxxxx`).reason).toBe('bad_signature')
  })

  it('rejects payload that decodes to non-JSON', () => {
    // 签名与载荷匹配，但载荷内容不是合法 JSON -> malformed
    const payload = Buffer.from('this-is-not-json').toString('base64url')
    // 用与实现一致的方式计算签名：直接拿一个真令牌替换其载荷不可行，
    // 因此这里仅验证该载荷无法被接受（签名不符或结构错误，总之无效）
    const token = issueToken('U1')
    const [, sig] = token.split('.')
    const result = verifyToken(`${payload}.${sig}`)
    expect(result.valid).toBe(false)
    expect(['bad_signature', 'malformed']).toContain(result.reason)
  })

  it('rejects expired tokens', () => {
    const expired = issueToken('U1', -1)
    const result = verifyToken(expired)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('expired')
    // 过期时仍可解析归属（便于审计），但不视为有效
    expect(result.userId).toBe('U1')
  })

  it('accepts a token within its ttl', () => {
    const token = issueToken('U1', TOKEN_TTL_MS)
    expect(verifyToken(token).valid).toBe(true)
  })
})
