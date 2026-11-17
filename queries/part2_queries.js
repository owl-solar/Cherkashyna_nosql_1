db = db.getSiblingDB("spotify");

// ── Завдання 1. Треки для вечірки ───────────────────────────
// danceability > 0.7, energy > 0.7, тривалість від 3 до 5 хв включно
const partyFilter = {
  "audio_features.danceability": { $gt: 0.7 },
  "audio_features.energy":       { $gt: 0.7 },
  duration_ms: { $gte: 180000, $lte: 300000 }
};

print("\n=== Завдання 1. Треки для вечірки ===");
print("Кількість документів:", db.tracks.countDocuments(partyFilter));
print("Унікальних track_id:",
  db.tracks.aggregate([
    { $match: partyFilter },
    { $group: { _id: "$track_id" } },
    { $count: "n" }
  ]).toArray()[0]?.n
);

printjson(
  db.tracks.find(partyFilter, {
    _id: 0,
    track_name: 1,
    artists: 1,
    track_genre: 1,
    popularity: 1,
    duration_sec: 1,
    "audio_features.danceability": 1,
    "audio_features.energy": 1
  })
  .sort({ popularity: -1, track_name: 1 })
  .limit(10)
  .toArray()
);

// ── Завдання 2. Виконавці, у яких усі треки популярні ───────
// ≥ 3 треки і мінімальна popularity ≥ 60; топ-20 за середньою popularity
print("\n=== Завдання 2. Виконавці, у яких усі треки популярні ===");

printjson(
  db.tracks.aggregate([
    { $unwind: "$artists" },
    // один і той самий трек (track_id) може бути записаний у кількох жанрах,
    // тому спершу залишаємо одну пару «артист — трек»
    { $group: {
        _id: { artist: "$artists", track_id: "$track_id" },
        popularity: { $max: "$popularity" }
    }},
    { $group: {
        _id: "$_id.artist",
        track_count:    { $sum: 1 },
        min_popularity: { $min: "$popularity" },
        avg_popularity: { $avg: "$popularity" }
    }},
    { $match: { track_count: { $gte: 3 }, min_popularity: { $gte: 60 } } },
    { $sort: { avg_popularity: -1, track_count: -1, _id: 1 } },
    { $limit: 20 },
    { $project: {
        _id: 0,
        artist: "$_id",
        track_count: "$track_count",
        min_popularity: "$min_popularity",
        avg_popularity: { $round: ["$avg_popularity", 1] }
    }}
  ]).toArray()
);

// ── Завдання 3. Нетипові треки ──────────────────────────────
// поріг жанру = avg(tempo) + 2 * stdDevPop(tempo)
print("\n=== Завдання 3. Нетипові треки ===");

const outliers = db.tracks.aggregate([
  { $group: {
      _id: "$track_genre",
      avg_tempo: { $avg: "$audio_features.tempo" },
      std_tempo: { $stdDevPop: "$audio_features.tempo" }
  }},
  { $addFields: {
      outlier_threshold: { $add: ["$avg_tempo", { $multiply: [2, "$std_tempo"] }] }
  }},
  { $lookup: {
      from: "tracks",
      let: { genre: "$_id", threshold: "$outlier_threshold" },
      pipeline: [
        { $match: {
            $expr: {
              $and: [
                { $eq: ["$track_genre", "$$genre"] },
                { $gt: ["$audio_features.tempo", "$$threshold"] }
              ]
            }
        }},
        { $sort: { "audio_features.tempo": -1 } },
        { $project: {
            track_name: 1,
            popularity: 1,
            artists: 1,
            "audio_features.tempo": 1
        }}
      ],
      as: "outlier_tracks"
  }},
  { $project: {
      _id: 0,
      avg_tempo: { $round: ["$avg_tempo", 1] },
      genre: "$_id",
      outlier_threshold: { $round: ["$outlier_threshold", 1] },
      outlier_tracks: "$outlier_tracks"
  }},
  { $sort: { genre: 1 } }
]).toArray();

const outlierTotal = outliers.reduce((sum, g) => sum + g.outlier_tracks.length, 0);
print("Жанрів:", outliers.length, "| нетипових треків:", outlierTotal);

print("\nЖанр acoustic:");
printjson(outliers.find(g => g.genre === "acoustic"));

print("\nКількість нетипових треків за жанрами (топ-10):");
printjson(
  outliers
    .map(g => ({
      genre: g.genre,
      avg_tempo: g.avg_tempo,
      outlier_threshold: g.outlier_threshold,
      outlier_count: g.outlier_tracks.length
    }))
    .sort((a, b) => b.outlier_count - a.outlier_count)
    .slice(0, 10)
);

// ── Завдання 4. Треки для фонової роботи ────────────────────
const workFilter = {
  "audio_features.loudness":         { $lt: -10 },
  "audio_features.speechiness":      { $lt: 0.1 },
  "audio_features.instrumentalness": { $gt: 0.5 },
  explicit: false
};

print("\n=== Завдання 4. Треки для фонової роботи ===");
print("Кількість документів:", db.tracks.countDocuments(workFilter));
print("Унікальних track_id:",
  db.tracks.aggregate([
    { $match: workFilter },
    { $group: { _id: "$track_id" } },
    { $count: "n" }
  ]).toArray()[0]?.n
);

printjson(
  db.tracks.find(workFilter, {
    _id: 0,
    track_name: 1,
    artists: 1,
    track_genre: 1,
    popularity: 1,
    explicit: 1,
    "audio_features.loudness": 1,
    "audio_features.speechiness": 1,
    "audio_features.instrumentalness": 1
  })
  .sort({ popularity: -1, track_name: 1 })
  .limit(10)
  .toArray()
);