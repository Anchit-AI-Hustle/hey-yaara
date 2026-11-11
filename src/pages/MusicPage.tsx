/**
 * MusicPage.tsx  –  Yaara Premium Music Hub (Dark Theme)
 *
 * Warm dark design with amber/rose accents.
 */

import { useMemo, useState } from "react";
import { Heart, Search, Play, Music, ArrowLeft, Star, Sparkles, MonitorPlay } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { openExternalUrlInNewTab } from "@/lib/external-links";
import { cn } from "@/lib/utils";

interface SongOption {
  title: string;
  badge: string;
  query: string;
  genre: string;
}

interface MusicSection {
  title: string;
  subtitle: string;
  songs: SongOption[];
}

const musicSections: MusicSection[] = [
  {
    title: "✨ Recommended for You",
    subtitle: "Aapke liye specially selected",
    songs: [
      { title: "Hanuman Chalisa",   badge: "🙏", query: "Hanuman Chalisa full song",   genre: "Bhajan" },
      { title: "Lag Jaa Gale",      badge: "🎵", query: "Lag Jaa Gale full song",      genre: "Classic" },
      { title: "Mundian To Bach Ke",badge: "💃", query: "Mundian To Bach Ke full song",genre: "Punjabi" },
      { title: "Kabhi Kabhie",      badge: "🌙", query: "Kabhi Kabhie full song",      genre: "Old Bollywood" },
      { title: "Achyutam Keshavam", badge: "🪔", query: "Achyutam Keshavam full song", genre: "Bhajan" },
      { title: "Om Jai Jagdish",    badge: "✨", query: "Om Jai Jagdish full song",    genre: "Aarti" },
    ],
  },
  {
    title: "🎬 Old Bollywood",
    subtitle: "Purane yaadgaar gaane aur yaadein",
    songs: [
      { title: "Mere Sapno Ki Rani",  badge: "🚂", query: "Mere Sapno Ki Rani full song",  genre: "Retro" },
      { title: "Dum Maro Dum",        badge: "🎵", query: "Dum Maro Dum full song",        genre: "Classic" },
      { title: "Tujhe Dekha To",      badge: "🌹", query: "Tujhe Dekha To full song",      genre: "Romantic" },
      { title: "Ajeeb Dastan Hai Yeh",badge: "📻", query: "Ajeeb Dastan Hai Yeh full song",genre: "Retro" },
      { title: "Tere Bina Zindagi Se",badge: "💔", query: "Tere Bina Zindagi Se full song",genre: "Sad" },
      { title: "Salaam-e-Ishq",       badge: "💕", query: "Salaam-e-Ishq full song",       genre: "Romantic" },
    ],
  },
  {
    title: "📿 Devotional",
    subtitle: "Shant aur sukoon bhari dhun",
    songs: [
      { title: "Raghupati Raghav", badge: "🕉️", query: "Raghupati Raghav full song", genre: "Bhajan" },
      { title: "Shri Ram Dhun",    badge: "🌼", query: "Shri Ram Dhun full song",    genre: "Devotional" },
      { title: "Gayatri Mantra",   badge: "✨", query: "Gayatri Mantra full song",   genre: "Mantra" },
      { title: "Shiv Dhun",        badge: "🌺", query: "Shiv Dhun full song",        genre: "Devotional" },
      { title: "Durga Chalisa",    badge: "⚡", query: "Durga Chalisa full song",    genre: "Chalisa" },
      { title: "Sai Baba Aarti",   badge: "🪔", query: "Sai Baba Aarti full song",   genre: "Aarti" },
    ],
  },
  {
    title: "🕺 Punjabi Beat",
    subtitle: "Thoda mood halka aur energetic karte hain",
    songs: [
      { title: "Jugni Ji",         badge: "🪩", query: "Jugni Ji full song",         genre: "Punjabi" },
      { title: "Paani Da Rang",    badge: "💧", query: "Paani Da Rang full song",    genre: "Soft" },
      { title: "Dil Da Mamla",     badge: "💛", query: "Dil Da Mamla full song",     genre: "Punjabi" },
      { title: "Laung Da Lashkara",badge: "🌼", query: "Laung Da Lashkara full song",genre: "Dance" },
      { title: "Sohniye",          badge: "💖", query: "Sohniye full song",          genre: "Romantic" },
      { title: "Tera Mera Pyar",   badge: "💑", query: "Tera Mera Pyar full song",   genre: "Love" },
    ],
  },
];

const searchYouTube = (query: string) => {
  openExternalUrlInNewTab(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
};

const MusicPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const categories = useMemo(() => {
    return ["All", ...musicSections.map(s => s.title.replace(/[^\w\s]/g, "").trim())];
  }, []);

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    
    let baseSections = musicSections;
    if (activeCategory !== "All") {
      baseSections = musicSections.filter(s => s.title.includes(activeCategory));
    }

    if (!q) return baseSections;

    return baseSections
      .map(section => ({
        ...section,
        songs: section.songs.filter(
          song =>
            song.title.toLowerCase().includes(q) ||
            song.genre.toLowerCase().includes(q),
        ),
      }))
      .filter(section => section.songs.length > 0);
  }, [search, activeCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (q) searchYouTube(q + " song");
  };

  const noLocalMatch = search.trim() !== "" && filteredSections.length === 0;

  return (
    <div className="min-h-screen pb-40 overflow-x-hidden">
      
      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-5%] left-[-10%] w-[45%] h-[40%] bg-amber-500/6 rounded-full blur-[120px]" />
        <div className="absolute bottom-[10%] right-[-10%] w-[40%] h-[45%] bg-rose-500/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative mx-auto w-full max-w-screen-xl px-4 pt-8 md:px-8 lg:px-12 xl:max-w-screen-2xl 2xl:max-w-[90rem]">
        
        {/* Header Container */}
        <header className="mb-10 rounded-[40px] glass-card p-8 md:p-12">
          <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 text-xs font-bold text-amber-400 uppercase tracking-widest">
                  <Sparkles className="h-3 w-3" /> Digital Radio for Elders
              </div>
              <h1 className="text-5xl font-black text-amber-50 md:text-7xl tracking-tighter leading-[0.95]">
                 Suron Ki <br/><span className="text-amber-400 italic">Duniya.</span>
              </h1>
              <p className="mt-6 text-xl leading-relaxed text-slate-400 font-medium max-w-lg">
                 Listen to your favorites, from golden classics to soothing bhajans. Everything is just one click away.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <button
                 onClick={() => navigate("/")}
                 className="group inline-flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 px-6 py-4 text-base font-bold text-amber-50 transition-all hover:bg-white/10 hover:border-amber-500/20"
              >
                 <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" /> Back to Dashboard
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative z-10 flex flex-col sm:flex-row items-stretch gap-4">
            <div className="relative flex-1">
              <div className="absolute left-7 top-1/2 -translate-y-1/2 text-amber-400">
                <Search className="h-8 w-8" />
              </div>
              <input
                id="music-search"
                type="text"
                placeholder="Koi bhi gaana likhein..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-[28px] border border-white/10 bg-white/5 py-6 pl-20 pr-8 text-xl font-bold text-amber-50 placeholder:text-slate-600 focus:bg-white/8 focus:border-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
              />
            </div>
            <button
              type="submit"
              className="flex items-center justify-center gap-3 rounded-[24px] bg-red-600 px-10 py-6 text-lg font-black text-white shadow-xl shadow-red-500/20 transition-all hover:bg-red-500 hover:-translate-y-1 active:scale-95"
            >
              <MonitorPlay className="h-7 w-7" />
              <span>Khojein</span>
            </button>
          </form>

          {/* No Match Alert */}
          {noLocalMatch && (
            <div className="mt-6 flex items-center gap-4 rounded-[24px] bg-amber-500/10 border border-amber-500/20 p-5">
              <Sparkles className="h-8 w-8 text-amber-400" />
              <div className="flex-1">
                <p className="text-lg font-bold text-amber-50 italic">
                  YouTube pe "<span className="text-amber-400 underline">{search}</span>" khoj rahe hain.
                </p>
                <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Click khojein to play everywhere</p>
              </div>
            </div>
          )}
        </header>

        {/* Category Tabs */}
        <div className="mb-12 flex gap-3 overflow-x-auto pb-4 scrollbar-hide px-4">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-8 py-4 rounded-2xl text-base font-bold transition-all whitespace-nowrap border",
                activeCategory === cat 
                  ? "bg-amber-500 border-amber-500 text-white shadow-xl shadow-amber-500/20 scale-105" 
                  : "bg-white/5 border-white/10 text-slate-400 hover:border-amber-500/30 hover:text-amber-300"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Music Content */}
        <div className="space-y-24 pb-20 px-4">
          {filteredSections.map(section => (
            <section key={section.title} className="relative">
              <div className="mb-10 group">
                <div className="flex items-center gap-4 mb-2">
                  <div className="h-10 w-1.5 rounded-full bg-amber-500 group-hover:h-12 transition-all duration-500" />
                  <h2 className="text-4xl font-black text-amber-50 tracking-tight">{section.title}</h2>
                </div>
                <p className="text-lg font-medium text-slate-500 max-w-2xl ml-5">{section.subtitle}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
                {section.songs.map(song => (
                  <button
                    key={`${section.title}-${song.title}`}
                    onClick={() => searchYouTube(song.query)}
                    className={cn(
                        "relative flex flex-col items-stretch rounded-[28px] glass-card p-6 group transition-all duration-500 overflow-hidden",
                        "hover:shadow-[0_32px_64px_-12px_rgba(0,0,0,0.4)] hover:border-amber-500/20 active:scale-[0.98]"
                    )}
                  >
                    <div className="relative mb-6 aspect-video overflow-hidden rounded-[20px] bg-white/5 flex items-center justify-center text-6xl group-hover:bg-amber-500/5 transition-colors duration-500">
                       <span className="relative z-10 group-hover:scale-110 transition-transform duration-700 select-none">
                         {song.badge}
                       </span>
                       <div className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 backdrop-blur shadow-sm flex items-center justify-center text-slate-500 group-hover:text-red-400 transition-colors">
                         <Play className={cn("h-5 w-5 transition-all group-hover:fill-current", song.genre === "Bhajan" ? "animate-pulse" : "")} />
                       </div>
                    </div>

                    <div className="flex-1 space-y-3">
                       <div className="flex items-center justify-between">
                         <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400/80 px-3 py-1 rounded-full bg-amber-500/10">
                           {song.genre}
                         </span>
                         <Star className="h-4 w-4 text-slate-600 group-hover:text-amber-400 transition-colors fill-current" />
                       </div>
                       <h3 className="text-xl font-black text-amber-50 leading-snug group-hover:text-amber-300 transition-colors line-clamp-1">
                         {song.title}
                       </h3>
                       <p className="text-sm font-bold text-slate-500">Click to play on YouTube</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center p-12 rounded-[40px] glass-card border border-amber-500/10">
           <div className="inline-flex items-center gap-2 text-amber-400 font-bold mb-6">
              <Star className="h-5 w-5 fill-current" /> Harmonious Living
           </div>
           <p className="text-3xl font-black text-amber-50 max-w-2xl mx-auto leading-tight italic">
              "Sangeet wo hai jo rooh ko sukoon de, aur yaadon ko taza kare."
           </p>
           <p className="mt-4 text-slate-500 font-bold uppercase tracking-widest text-sm">Yaara Music Player</p>
        </footer>
      </div>
    </div>
  );
};

export default MusicPage;
