# Security Specification: Wedding Invitation RSVP and Guest List

This document outlines the security architecture, invariants, threat modeling ("Dirty Dozen" payloads), and test coverage for the Wedding Invitation and Guest List system.

## 1. Data Invariants & Zero-Trust Policies

1. **Singleton Config Constraint**: The `wedding_config` collection must ONLY contain the document `default_config`. Any attempt to create other documents or delete this document must be strictly blocked to prevent database pollution.
2. **Strict Schema Integrity**: All document creations and updates must strictly conform to their respective validation helper functions. No unlisted or oversized fields are allowed.
3. **Guests Immutable Identity**: Once a guest is created by the organizer, their core identity (`name`, `code`, `maxGuests`) is immutable. Guests can only update their confirmation fields (`confirmed`, `attending`, `guestsCount`, `notes`, `submittedAt`).
4. **Resource Exhaustion Guard (DoW)**: All string fields across all collections have explicit `.size()` limits. All numerical fields have logical boundaries. Document ID path variables are validated for length and regex pattern compliance.
5. **No Blind Deletes or Writes**: Unauthenticated users can only create RSVPs and update guest confirmations within strict structural constraints. Bulk creations, random updates, or deletions are restricted or heavily validated.

---

## 2. Threat Modeling: The "Dirty Dozen" Payloads

The following payloads are designed to break the system's security. All of these must be rejected by the security rules with `PERMISSION_DENIED`.

### Payload 1: Defacement of Wedding Config with Shadow Fields
An attacker tries to update the wedding configuration to add a malicious field `maliciousScript` or modify administrative settings.
```json
{
  "coupleName1": "Alejandro",
  "coupleName2": "Alejandra",
  "dateIso": "2025-08-15T16:00:00",
  "maliciousScript": "<script>alert('hacked')</script>"
}
```
*Expected Result:* **PERMISSION_DENIED** (strict key matching and validation rejects extra/unexpected keys).

### Payload 2: Wedding Config Creation with Invalid ID
An attacker tries to create a new, second configuration document with a custom ID like `hacked_config` to bypass the default view.
*Expected Result:* **PERMISSION_DENIED** (the document ID must strictly match `'default_config'`).

### Payload 3: Excessively Large String in Wedding Config (Denial of Wallet)
An attacker attempts to write a 1MB string into the `subtitle` field to bloat Firestore storage and incur massive read/write costs.
```json
{
  "coupleName1": "A",
  "coupleName2": "B",
  "dateIso": "2025-08-15T16:00:00",
  "subtitle": "A..." // 1,000,000 characters
}
```
*Expected Result:* **PERMISSION_DENIED** (string size limits are strictly enforced, e.g., `subtitle.size() <= 500`).

### Payload 4: RSVP Submission with Missing Required Fields
A malicious script attempts to post incomplete RSVP documents to pollute the collection.
```json
{
  "fullName": "John Doe",
  "attending": "yes"
}
```
*Expected Result:* **PERMISSION_DENIED** (required keys `email` and `guestsCount` are missing).

### Payload 5: RSVP Submission with Excessively High Guest Count
An attacker submits an RSVP claiming `9999` guests to break UI charts and logistics.
```json
{
  "fullName": "Jane Doe",
  "email": "jane@example.com",
  "attending": "yes",
  "guestsCount": 9999,
  "submittedAt": "2025-08-15T16:00:00"
}
```
*Expected Result:* **PERMISSION_DENIED** (guests count must be a number between 0 and 20).

### Payload 6: RSVP with Non-existent Enum Value
An attacker attempts to write an invalid option for `attending` like `"maybe"`.
```json
{
  "fullName": "Jane Doe",
  "email": "jane@example.com",
  "attending": "maybe",
  "guestsCount": 2,
  "submittedAt": "2025-08-15T16:00:00"
}
```
*Expected Result:* **PERMISSION_DENIED** (`attending` must be strictly `"yes"` or `"no"`).

### Payload 7: Guest Modification of Name or MaxGuests
A guest attempts to update their own invitation to change their name or increase their maximum allowed guests.
```json
{
  "name": "Hacked Name",
  "maxGuests": 100,
  "confirmed": true,
  "attending": "yes",
  "guestsCount": 5
}
```
*Expected Result:* **PERMISSION_DENIED** (`name` and `maxGuests` are immutable during updates).

### Payload 8: Guest Creation by Unprivileged Client
An attacker tries to self-insert their name into the guest list to get a valid entry code.
```json
{
  "name": "Gate Crasher",
  "maxGuests": 5,
  "code": "gate-crasher",
  "confirmed": false
}
```
*Expected Result:* **PERMISSION_DENIED** (creation of guests is restricted or heavily locked down to prevent self-insertion).

### Payload 9: ID Poisoning Attack on RSVP
An attacker attempts to write an RSVP document with a massive ID containing invalid characters.
*Document ID:* `rsvp_very_long_junk_id_1234567890_1234567890_1234567890_1234567890_...`
*Expected Result:* **PERMISSION_DENIED** (`isValidId` enforces maximum length and regex alphanumeric characters).

### Payload 10: State Shortcut on RSVP Update
An attacker attempts to update another guest's RSVP to change their name.
*Expected Result:* **PERMISSION_DENIED** (unauthenticated RSVP updates are restricted to strict key sets or denied entirely).

### Payload 11: Invalid Timestamp on RSVP
An attacker attempts to spoof a past or future timestamp inside `submittedAt` to alter registration logs.
```json
{
  "fullName": "Jane Doe",
  "email": "jane@example.com",
  "attending": "yes",
  "guestsCount": 2,
  "submittedAt": "1999-01-01T00:00:00"
}
```
*Expected Result:* **PERMISSION_DENIED** (`submittedAt` must be a valid ISO-8601 string structure).

### Payload 12: Injection of Malicious Types (Value Poisoning)
An attacker attempts to write a boolean where a string is expected, or an array where a single string is expected.
```json
{
  "fullName": true,
  "email": "jane@example.com",
  "attending": "yes",
  "guestsCount": 2
}
```
*Expected Result:* **PERMISSION_DENIED** (type checking `is string` ensures exact types).

---

## 3. Test Runner Design Blueprint

Below is the conceptual TypeScript test runner code that maps out the security assertions of our ruleset.

```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

describe('Wedding Invitation Security Rules', () => {
  let testEnv;

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'wedding-test-project',
      firestore: {
        rules: require('fs').readFileSync('firestore.rules', 'utf8'),
      },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('blocks wedding config creation with non-default ID', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthDb.doc('wedding_config/bad_id').set({
      coupleName1: 'Alex',
      coupleName2: 'Sam',
      dateIso: '2025-08-15T16:00:00'
    }));
  });

  it('allows public reads of wedding config default_config', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(unauthDb.doc('wedding_config/default_config').get());
  });

  it('rejects oversized text or extra keys in wedding_config', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthDb.doc('wedding_config/default_config').set({
      coupleName1: 'Alex',
      coupleName2: 'Sam',
      dateIso: '2025-08-15T16:00:00',
      extraKey: 'malicious'
    }));
  });

  it('allows unauthenticated creation of valid RSVPs', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(unauthDb.doc('rsvps/valid-rsvp').set({
      fullName: 'Alice Smith',
      email: 'alice@example.com',
      attending: 'yes',
      guestsCount: 2,
      notes: 'No peanuts please',
      submittedAt: '2026-07-02T08:26:24.000Z'
    }));
  });

  it('blocks guest updates that change name or maxGuests', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthDb.doc('guests/some-guest').update({
      name: 'Changed Name'
    }));
  });
});
```
