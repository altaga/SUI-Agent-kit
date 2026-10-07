import { isAuthed, json } from '../../../server/bff';

export async function GET(request: Request) {
  return json({ authed: isAuthed(request), configured: !!process.env.SUIDE_PASSWORD });
}
