require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// --- Configuration ---
const app = express();
const PORT = 3001;

// Supabase credentials from .env file
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Initialize Supabase clients
// 'supabase' is the public client (read-only)
const supabase = createClient(supabaseUrl, supabaseAnonKey);
// 'supabaseAdmin' is the service client (for writing data)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Points configuration
const points = {
  INDIVIDUAL: { 1: 10, 2: 7, 3: 5 },
  GROUP: { 1: 20, 2: 15, 3: 10 }
};

// --- Middleware ---
app.use(cors()); // Allow requests from your HTML files
app.use(express.json()); // Parse JSON bodies

// --- API Endpoints ---

/**
 * GET /api/config
 * Provides the public Supabase config to the frontend for the real-time connection.
 */
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  });
});

/**
 * GET /api/institutes
 * Fetches all institutes for the admin panel dropdowns.
 */
app.get('/api/institutes', async (req, res) => {
  const { data, error } = await supabase.from('institutes').select('id, name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/**
 * GET /api/events
 * Fetches all predefined events for the admin panel dropdowns.
 */
app.get('/api/events', async (req, res) => {
  const { data, error } = await supabase.from('events').select('id, name, type');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/**
 * POST /api/results
 * (Admin Only) Adds a new event result to the database.
 * Allows null for missing places.
 */
app.post('/api/results', async (req, res) => {
  const { event_name, event_type, first_place_id, second_place_id, third_place_id } = req.body;

  // Basic validation
  if (!event_name || !event_type) {
    return res.status(400).json({ error: 'Event name and type are required.' });
  }

  // Prepare payload (convert empty strings to null)
  const payload = {
    event_name,
    event_type,
    first_place_id: first_place_id || null,
    second_place_id: second_place_id || null,
    third_place_id: third_place_id || null,
  };

  const { data, error } = await supabaseAdmin.from('results').insert([payload]);

  if (error) {
    console.error('Supabase insert error:', error);
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json({ message: 'Result added successfully', data });
});


/**
 * GET /api/leaderboard
 * This is the main endpoint for the public leaderboard.
 * It fetches all data and calculates scores and medal counts.
 */
app.get('/api/leaderboard', async (req, res) => {
  // 1. Fetch all institutes
  const { data: institutes, error: instError } = await supabase
    .from('institutes')
    .select('id, name');
  if (instError) return res.status(500).json({ error: instError.message });

  // 2. Fetch all results
  const { data: results, error: resError } = await supabase
    .from('results')
    .select('*');
  if (resError) return res.status(500).json({ error: resError.message });

  // 3. Initialize scores and medal counts for each institute
  const leaderboard = {};
  institutes.forEach(inst => {
    leaderboard[inst.id] = {
      name: inst.name,
      individual: [0, 0, 0], // [Gold, Silver, Bronze]
      group: [0, 0, 0],       // [Gold, Silver, Bronze]
      total: 0
    };
  });

  // 4. Process all results and calculate scores
  results.forEach(result => {
    const eventType = result.event_type; // 'INDIVIDUAL' or 'GROUP'
    const pointValues = points[eventType]; // { 1: 10, 2: 7, 3: 5 } or { 1: 20, 2: 15, 3: 10 }

    if (!pointValues) return; // Skip if event_type is invalid

    // Process 1st Place
    if (result.first_place_id && leaderboard[result.first_place_id]) {
      leaderboard[result.first_place_id].total += pointValues[1];
      if (eventType === 'INDIVIDUAL') {
        leaderboard[result.first_place_id].individual[0]++;
      } else {
        leaderboard[result.first_place_id].group[0]++;
      }
    }
    
    // Process 2nd Place
    if (result.second_place_id && leaderboard[result.second_place_id]) {
      leaderboard[result.second_place_id].total += pointValues[2];
      if (eventType === 'INDIVIDUAL') {
        leaderboard[result.second_place_id].individual[1]++;
      } else {
        leaderboard[result.second_place_id].group[1]++;
      }
    }
    
    // Process 3rd Place
    if (result.third_place_id && leaderboard[result.third_place_id]) {
      leaderboard[result.third_place_id].total += pointValues[3];
      if (eventType === 'INDIVIDUAL') {
        leaderboard[result.third_place_id].individual[2]++;
      } else {
        leaderboard[result.third_place_id].group[2]++;
      }
    }
  });

  // 5. Convert from object to array and sort by total score
  const sortedLeaderboard = Object.values(leaderboard).sort((a, b) => b.total - a.total);

  res.json(sortedLeaderboard);
});


// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
