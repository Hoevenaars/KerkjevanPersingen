import {test, describe} from 'node:test'
import assert from 'node:assert/strict'
import {isWebmaster} from '../sanity/lib/rollen.ts'

describe('isWebmaster', () => {
  test('administrator mag de vriendenlijst zien', () => {
    assert.equal(
      isWebmaster({email: 'iemand@example.com', roles: [{name: 'administrator'}]}),
      true,
    )
  })

  test('editor mag de vriendenlijst niet zien', () => {
    assert.equal(
      isWebmaster({
        email: 'contractbeheer.kvp@gmail.com',
        roles: [{name: 'editor'}],
      }),
      false,
    )
  })

  test('webmaster-e-mail mag de lijst zien, ook zonder administrator-rol', () => {
    assert.equal(
      isWebmaster({email: 'nhoevenaars@gmail.com', roles: [{name: 'editor'}]}),
      true,
    )
  })

  test('zonder gebruiker is er geen toegang', () => {
    assert.equal(isWebmaster(null), false)
    assert.equal(isWebmaster(undefined), false)
  })
})
