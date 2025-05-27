const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: process.env.DB_CONN_LIMIT ? parseInt(process.env.DB_CONN_LIMIT) : 10,
    queueLimit: 0
};

// Create database connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('Database connected successfully');
        connection.release();
    } catch (error) {
        console.error('Database connection failed:', error);
    }
}

// Helper function to build WHERE clause
function buildWhereClause(filters) {
    let whereConditions = [];
    let params = [];

  // Handle partnerId (single select)
  if (filters.partnerId && filters.partnerId !== 'all') {
      // Find publisher_id for this partner
      whereConditions.push('publisher_id = ?');
      params.push(filters.publisherId);
    }

  // Handle multiple domains
  if (filters.domains && filters.domains.length > 0) {
      const domainPlaceholders = filters.domains.map(() => '?').join(',');
      whereConditions.push(`domain_name IN (${domainPlaceholders})`);
      params.push(...filters.domains);
    }

    if (filters.dateFrom) {
        whereConditions.push('date >= ?');
        params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
        whereConditions.push('date <= ?');
        params.push(filters.dateTo);
    }

    // Always filter active records
    whereConditions.push('status = 1');

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    return { whereClause, params };
}

// API Routes

// Get filter options (domains and partners)
app.get('/api/filter-options', async (req, res) => {
    try {
        // Fetch partners
        const [partnersRows] = await pool.execute(
            'SELECT id, name, publishers_id FROM ads_partners WHERE status = 1 ORDER BY name'
        );
        const partners = [{ id: 'all', name: 'All', publishers_id: null }, ...partnersRows.map(row => ({ id: row.id, name: row.name, publishers_id: row.publishers_id }))];

        // Determine publisher_id for domain filtering
        let publisherIds = [];
        if (req.query.partnerId && req.query.partnerId !== 'all') {
            // Find the selected partner's name
            const selectedPartner = partners.find(p => p.id == req.query.partnerId);
            if (selectedPartner) {
                // Find all partners with the same name
                const allMatchingPartners = partnersRows.filter(row => row.name === selectedPartner.name);
                publisherIds = allMatchingPartners.map(row => row.publishers_id).filter(id => id != null);
                // Fetch and log domains for these publisherIds
                if (publisherIds.length > 0) {
                    const [debugDomains] = await pool.execute(
                        `SELECT DISTINCT domain_name FROM adsense_test WHERE status = 1 AND publisher_id IN (${publisherIds.map(() => '?').join(',')})`,
                        publisherIds
                    );
                }
            }
        }

        // Fetch domains, optionally filtered by publisher_id
        let domains = [];
        if (publisherIds.length > 0) {
            const [domainRows] = await pool.execute(
                `SELECT DISTINCT domain_name FROM adsense_test WHERE status = 1 AND publisher_id IN (${publisherIds.map(() => '?').join(',')}) ORDER BY domain_name`,
                publisherIds
            );
            domains = domainRows;
        } else {
            const [domainRows] = await pool.execute(
                'SELECT DISTINCT domain_name FROM adsense_test WHERE status = 1 ORDER BY domain_name'
            );
            domains = domainRows;
        }

        const response = {
            partners: partners.map(p => ({ id: p.id, name: p.name })),
            domains: domains.map(row => row.domain_name)
        };
        res.json(response);
    } catch (error) {
        console.error('Error fetching filter options:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get KPI summary
app.post('/api/kpis', async (req, res) => {
    try {
        const { whereClause, params } = buildWhereClause(req.body);

        const query = `
            SELECT 
                COALESCE(SUM(impressions), 0) as totalImpressions,
                COALESCE(SUM(page_views), 0) as totalPageViews,
                COALESCE(SUM(estimated_earnings), 0) as totalRevenue,
                CASE 
                    WHEN SUM(impressions) > 0 THEN (SUM(estimated_earnings) / SUM(impressions)) * 1000
                    ELSE 0 
                END as avgEcpm
            FROM adsense_test 
            ${whereClause}
        `;

        const [results] = await pool.execute(query, params);
        const kpis = results[0];

        res.json({
            totalImpressions: parseInt(kpis.totalImpressions) || 0,
            totalPageViews: parseInt(kpis.totalPageViews) || 0,
            totalRevenue: parseFloat(kpis.totalRevenue) || 0,
            avgEcpm: parseFloat(kpis.avgEcpm) || 0
        });
    } catch (error) {
        console.error('Error fetching KPIs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get table data
app.post('/api/table-data', async (req, res) => {
    try {
        const { whereClause, params } = buildWhereClause(req.body);

        const query = `
            SELECT 
                date,
                domain_name,
                page_views,
                impressions,
                page_views_rpm,
                impressions_rpm,
                active_view_viewability,
                estimated_earnings,
                CASE 
                    WHEN impressions > 0 THEN (estimated_earnings / impressions) * 1000
                    ELSE 0 
                END as ecpm
            FROM adsense_test 
            ${whereClause}
            ORDER BY date DESC, domain_name ASC
        `;

        const [results] = await pool.execute(query, params);
        res.json(results);
    } catch (error) {
        console.error('Error fetching table data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get chart data
app.post('/api/chart-data', async (req, res) => {
    try {
        const { metric, ...filters } = req.body;
        const { whereClause, params } = buildWhereClause(filters);

        // Validate metric
      const allowedMetrics = ['estimated_earnings', 'impressions', 'page_views', 'ecpm'];
        const selectedMetric = allowedMetrics.includes(metric) ? metric : 'estimated_earnings';

        const query = `
          WITH daily_stats AS (
            SELECT 
                date,
                  SUM(impressions) as total_impressions,
                  SUM(estimated_earnings) as total_earnings,
                  SUM(${selectedMetric === 'ecpm' ? 'estimated_earnings' : selectedMetric}) as metric_value
            FROM adsense_test 
            ${whereClause}
            GROUP BY date
          )
          SELECT 
              date,
              CASE 
                  WHEN '${selectedMetric}' = 'ecpm' THEN 
                      CASE 
                          WHEN total_impressions > 0 THEN (total_earnings / total_impressions) * 1000
                          ELSE 0 
                      END
                  ELSE metric_value
              END as value
          FROM daily_stats
            ORDER BY date ASC
        `;

        const [results] = await pool.execute(query, params);

        // Format data for Chart.js
        const labels = results.map(row => {
            const date = new Date(row.date);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });

        const values = results.map(row => parseFloat(row.value) || 0);

        res.json({ labels, values });
    } catch (error) {
        console.error('Error fetching chart data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        const [results] = await pool.execute('SELECT 1 as test');
        res.json({ status: 'healthy', database: 'connected' });
    } catch (error) {
        res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM ads_dashboard_creds WHERE username = ? AND password = ?',
            [username, password]
        );
        if (rows.length === 1) {
            const { role, username } = rows[0];
            res.json({ success: true, role, username });
        } else {
            res.json({ success: false, message: 'Invalid credentials' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Handle 404
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await testConnection();
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    await pool.end();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down server...');
    await pool.end();
    process.exit(0);
});