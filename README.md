# 🌊 Ocean Drop Simulator (The "Will I Die?" Engine)

**Inspired by [this legendary Reddit analysis](https://www.reddit.com/r/theydidthemath/comments/1q840uk/self_a_simulation_of_being_dropped_randomly_in/) by u/spdd.**

Welcome to the digital anxiety machine that answers the burning question: *"If a god-like entity teleported me to a random coordinate on Earth, how fast would I freeze/drown/be eaten by a squid?"*

Spoiler: You're mostly going to be wet, cold, and alone.

## 🤓 The Nerdy Stuff (How It Works)

Unlike your standard "point at a pixel and guess" simulation, we decided to over-engineer this because accuracy matters when you're hypothermic.

### The Tech Stack
- **Vanilla JS & D3.js**: No frameworks, just raw DOM manipulation and SVG magic.
- **Ray-Casting Algorithm**: Used for `point-in-polygon` checks. We don't just guess if you hit land; we mathematically prove it by casting a ray from your drop location to infinity and counting how many times it crosses a country's border.
- **Geodesic Distance (Haversine)**: We calculate the *exact* curvature-aware distance to the nearest coastline. None of that flat-earth euclidean nonsense.
- **NOAA Sea Surface Temperature Data**: We use approximate latitudinal lookup tables to tell you exactly how quickly your extremities will go numb.

### Data Optimization (Or: "How we fit Earth into 15MB")
We load a high-res `land-10m.json` TopoJSON file for accurate rendering, but for the actual physics engine, we use a precomputed, flattened polygon set. 
- **Total Coastline Points**: ~408,000
- **Total Polygons**: ~4,062
- **Antarctica Handling**: Ray-casting gets weird at the poles (dateline wrapping is a nightmare), so we implemented a "South Pole Safety Net" (anything south of -80° is legally considered solid ground/ice).

## 🚀 How to Run Locally

If you want to run this on your potato:

1. Clone this repo.
2. Run a simple HTTP server (CORS hates `file://` protocols):
   ```bash
   python3 -m http.server 8000
   ```
   or
   ```bash
   npx http-server
   ```
3. Open `http://localhost:8000` and start freezing.

## ☁️ Deploying to Cloudflare Pages

This bad boy is optimized for the edge.

1. **GitHub**: Push this code to a repo.
2. **Cloudflare Dashboard**: Go to Pages > Create Project > Connect to Git.
3. **Build Settings**: 
   - **Framework Preset**: None / Static HTML
   - **Build Command**: (Leave empty)
   - **Output Directory**: (Leave empty or `.`)
4. **Deploy**: Smash that button.

*Note: The optimized data file is ~15MB, which slides comfortably under Cloudflare's 25MB single file limit.*

---

## 📢 Reddit Post Template (r/theydidthemath)

**Title**: [Self] I built a simulator so you can finally test the "Ocean Drop" theory yourself. Spoiler: Pack a sweater.

**Body**:
> Years ago, u/spdd posted the legendary analysis: *A Simulation of Being Dropped Randomly in the Ocean Every Day for 5 Years.* It was great math, but I wanted to know: *Where exactly would **I** land?*
>
> So I built an interactive engine to find out.
> 
> **You can now run the simulation yourself:** https://ods.simenf.com
>
> **What it does:**
> *   **Real-time Drops**: Watch as it teleports you to random coordinates on a high-res vector map.
> *   **Survival Stats**: Calculates the exact sea surface temperature and distance to the nearest coast for every single drop.
> *   **Prove It**: Every drop generates a **Google Maps link** (with a marker) so you can zoom in and see exactly which patch of dark, featureless ocean is your grave.
> *   **Analyze the Data**: You can sort your drops by "Closest to Land" (hope!) or "Coldest Temp" (despair!).
>
> I used accurate geodesic math (Haversine) because if I'm going to freeze to death 2,000km from Chile, I want to know it's *exactly* 2,000km.
>
> Source code is available here if you want to check my math: https://github.com/simenf/Oceandropsimulator
>
> Let me know your "best" (closest to land) and "worst" (Point Nemo) drops in the comments!
