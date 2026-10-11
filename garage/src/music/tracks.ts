import type { Track } from './playlist';

/**
 * The licensed songs from Need for Speed: Most Wanted (2005), in the game's order after "I Am Rock". Each is pinned
 * to the artist's, label's or YouTube Topic upload (checked with YouTube oEmbed on 2026-10-11), so the garage
 * streams rather than re-hosts them. "I Am Rock" has no official upload, so it uses fan uploads. EA's own score,
 * and the songs with no official upload (The Perceptionists, Static-X, The Roots & BT, Stratus), are left out.
 */
export const TRACKS: readonly Track[] = [
  { artist: 'Rock', title: 'I Am Rock', ids: ['MhrjEWSkznM', '0JklSDqoUOU', 'emUs7Wi1egc'] },
  { artist: 'Styles of Beyond', title: 'Nine Thou (Superstars Remix)', ids: ['M_s95No5E-s'] },
  { artist: 'T.I. presents the P$C', title: 'Do Ya Thang', ids: ['IxdzBlBtONA', '2qYlc-Y25-s'] },
  { artist: 'Suni Clay', title: 'In a Hood Near You', ids: ['bj7VCaNMQIY', '-IHDiFVOkBw'] },
  { artist: 'Juvenile', title: 'Sets Go Up', ids: ['IswCPP69vcI', 'ewLy6k629Iw'] },
  { artist: 'Hush', title: 'Fired Up', ids: ['7sLHlg_VW2A'] },
  { artist: 'DJ Spooky & Dave Lombardo', title: 'B-Side Wins Again', ids: ['aAd9r4SCOjg', 'MkgjK1gOBj8'] },
  { artist: 'Celldweller', title: 'One Good Reason', ids: ['BvURkiywtL8'] },
  { artist: 'Lupe Fiasco', title: 'Tilted', ids: ['L5JNM8wHTt0'] },
  { artist: 'Ils', title: 'Feed the Addiction', ids: ['TWhQ9ZjBZWE', 'khHcKW93CeM'] },
  { artist: 'Celldweller feat. Styles of Beyond', title: 'Shapeshifter', ids: ['kRrOq4NipQQ'] },
  { artist: 'Hyper', title: 'We Control', ids: ['dlxg6ljNWgg'] },
  { artist: 'Dieselboy & Kaos', title: 'Barrier Break', ids: ['DjpQQOWLjHU', '9ILhcFEx_tk'] },
  { artist: 'Disturbed', title: 'Decadence', ids: ['-daTpfB-7K4'] },
  { artist: 'The Prodigy', title: 'You’ll Be Under My Wheels', ids: ['wFAA0_Acvqw'] },
  { artist: 'Mastodon', title: 'Blood and Thunder', ids: ['labytsb3gfI', 'TsdIO8RHMTc'] },
  { artist: 'Evol Intent & Mayhem feat. Thinktank', title: 'Broken Sword', ids: ['_0BY6gnCeIU'] },
  { artist: 'Bullet for My Valentine', title: 'Hand of Blood', ids: ['o6QDNLsrr5Y', 'c0SrxSMHDmE'] },
  { artist: 'Avenged Sevenfold', title: 'Blinded in Chains', ids: ['xCvKddFyXbs'] },
  { artist: 'Jamiroquai', title: 'Feels Just Like It Should (Timo Maas Remix)', ids: ['nhZ2_gl1GnQ'] },
];

/** The same songs as an ad-hoc YouTube playlist, for when the embedded player can't load. */
export const YOUTUBE_FALLBACK_URL = `https://www.youtube.com/watch_videos?video_ids=${TRACKS.map((track) => track.ids[0]).join(',')}`;
