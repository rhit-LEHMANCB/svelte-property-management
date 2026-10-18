import { Window } from 'happy-dom';

/** Parses server-rendered component HTML into a document the test can query. */
export function parseHtml(body: string) {
	const window = new Window();
	window.document.body.innerHTML = body;
	return window.document;
}
