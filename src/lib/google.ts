import { Loader, type LoaderOptions, type google } from 'google-maps';
import { PUBLIC_FB_API_KEY } from '$app/env/public';

let googleApi: google | undefined;

export async function loadGoogle() {
	const options: LoaderOptions = { libraries: ['places'] };
	const loader = new Loader(PUBLIC_FB_API_KEY, options);
	const google = await loader.load();
	return google;
}

export async function getGoogle(): Promise<google> {
	if (googleApi) {
		return googleApi;
	}

	googleApi = await loadGoogle();
	return googleApi;
}
