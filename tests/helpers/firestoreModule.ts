// Replaces `firebase-admin/firestore` in handler tests, so FieldValue, Timestamp and FieldPath
// are the sentinels the in-memory fake understands.
export {
	FakeFieldPath as FieldPath,
	FakeFieldValue as FieldValue,
	FakeTimestamp as Timestamp
} from './fakeFirestore';
