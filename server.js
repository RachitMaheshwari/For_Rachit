console.log("Server is starting...");

require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const { google } = require('googleapis');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'testdata',
    password: 'rachit',
    port: 5432,
});

// Dynamically serve any HTML file or fallback to 'vendor-info.html' if root is accessed. Change the Default by replacing 'project-info.html' to as you want
app.get('/:file?', (req, res) => {
    const file = req.params.file ? req.params.file : 'project-info.html';
    res.sendFile(path.join(__dirname, 'public', file), err => {
        if (err) {
            // If the file is not found, send the default 'vendor-info.html'
            if (err.code === 'ENOENT') {
                res.sendFile(path.join(__dirname, 'public', 'project-info.html'));
            } else {
                res.status(500).send("Server Error");
            }
        }
    });
});

// Endpoint to fetch all services
app.get('/api/services', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM services');
        res.json(result.rows);
    } catch (err) {
        console.error("Failed to fetch services:", err);
        res.status(500).send('Server Error');
    }
});

// Endpoint to fetch a specific company by ID
app.get('/api/companies/:id', async (req, res) => {
    const companyId = req.params.id;
    try {
        const companyQuery = `
            SELECT c.*, 
                   json_agg(distinct e.*) as employees,
                   json_agg(distinct jsonb_build_object(
                    'id', sr.id,
                    'company_id', sr.company_id,
                    'service_name', sr.service_name,
                    'project_basis', sr.project_basis,
                    'rate', sr.rate
                )) as service_rates,
                coalesce(json_agg(distinct d.domain) filter (where d.domain is not null), '[]') as domains,
                coalesce(json_agg(distinct jsonb_build_object(
                    'id', ee.id,
                    'name', ee.name,
                    'email', ee.email
                )) filter (where ee.id is not null), '[]') as extracted_emails
            FROM companies c
            LEFT JOIN employees e ON e.company_id = c.id
            LEFT JOIN service_rates sr ON sr.company_id = c.id
            LEFT JOIN domains d ON d.company_id = c.id
            LEFT JOIN extracted_emails ee ON ee.domain_id = d.id
            WHERE c.id = $1
            GROUP BY c.id`;

        const result = await pool.query(companyQuery, [companyId]);
        console.log('Employee subquery result:', result.rows[0].employees);
        console.log('Service rates subquery result:', result.rows[0].service_rates);
        console.log('Domains subquery result:', result.rows[0].domains);
        console.log('Query result:', JSON.stringify(result.rows, null, 2)); // Add detailed logging
        if (result.rows.length > 0) {
            console.log('Query result:', JSON.stringify(result.rows, null, 2)); // Detailed logging
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: "Company not found" });
        }
    } catch (err) {
        console.error("Failed to fetch company:", err);
        res.status(500).json({ error: 'Server Error', details: err.message });
    }
});



// Endpoint to create a new company or update an existing company
app.route('/api/companies/:id?')
    .post(async (req, res) => {
        console.log("Received request body:", req.body);  // Debug log
        const {
            name, country, address, dateCreated, lastConversationDate, preferredPaymentMode, lastConversationSubject,
            employees = [],  // Default to an empty array if not provided
            serviceRates = [],  // Default to an empty array if not provided
            domain  // Add domain here
        } = req.body;

        // Log the domain value received in the request
        console.log('Domain in request (POST):', domain);

        // Determine the type based on the country
        const type = country === 'India' ? 'domestic' : 'international';

        console.log("Ready to insert:", {
            name, type, address, country, dateCreated, lastConversationDate, preferredPaymentMode, lastConversationSubject, domain
        });    


        // Check for required fields
        if (!name || !address || !country) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        try {
            console.log("Starting transaction for new company");
            // Start transaction
            await pool.query('BEGIN');
            const companyResult = await pool.query(
                'INSERT INTO companies (name, type, address, country, date_created, last_conversation_date, preferred_payment_mode, last_conversation_subject) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
                [name, type, address, country, dateCreated, lastConversationDate || new Date().toISOString().split('T')[0], preferredPaymentMode, lastConversationSubject]
                

            );
            const companyId = companyResult.rows[0].id;
            console.log("Company inserted with ID:", companyId); // Removable line


 // Insert into credentials table for client
 await pool.query(
    'INSERT INTO credentials (user_type, user_id, password) VALUES ($1, $2, $3)',
    ['client', companyId.toString(), ''] // Use companyId for user_id
);



            // Insert domain
            if (domain) {
                await pool.query('INSERT INTO domains (company_id, domain) VALUES ($1, $2)', [companyId, domain]);
            }

            // Insert employees - Check if employees data is iterable
            //console.log("Inserting employees data:", employees); // Can be removed
            if (Array.isArray(employees)) {
                for (const employee of employees) {
                    await pool.query(
                        'INSERT INTO employees (company_id, name, role, email, is_active, linkedin_link, should_mail, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                        [companyId, employee.name, employee.role, employee.email, employee.is_active, employee.linkedin_link, employee.should_mail, employee.notes]
                    );
                }
            }

            // Insert service rates - Check if employees data is iterable
            console.log("Inserting service rates data:", serviceRates); // Can be removed
            if (Array.isArray(serviceRates)) {
                for (const rate of serviceRates) {
                    const projectBasisValue = rate.projectBasis === true; // Convert to a boolean value
                    await pool.query(
                        'INSERT INTO service_rates (company_id, service_name, rate, project_basis) VALUES ($1, $2, $3, $4)',
                        [companyId, rate.serviceId, rate.rate || null, projectBasisValue]
                    );
                }
            }

            // Commit transaction
            await pool.query('COMMIT');
            console.log("Transaction committed");
            res.status(201).json({ message: "Company and associated data added successfully!" });
        } catch (err) {
            // Rollback in case of error
            await pool.query('ROLLBACK');
            console.error("Transaction failed, rolled back", err); // Earlier this line was just this console.error(err.message);        
            res.status(500).send('Server Error');
        }
    })
    .put(async (req, res) => {
        const companyId = req.params.id;
        if (!companyId) {
            return res.status(400).json({ error: 'Company ID is required for update' });
        }
    
        const {
            name,
            country,
            address,
            dateCreated,
            lastConversationDate,
            preferredPaymentMode,
            lastConversationSubject,
            employees = [],
            serviceRates = [],
            domain  // Add domain here
        } = req.body;

        // Log the domain value received in the request
        console.log('Domain in request (PUT):', domain);

        console.log("Received update for company:", companyId, "with data:", req.body);
    
        try {
            await pool.query('BEGIN');

            const lastConversationDateValue = lastConversationDate || new Date().toISOString().split('T')[0];
    
            // Update company details
            const updateQuery = `
                UPDATE companies
                SET name = $1, country = $2, address = $3, date_created = $4, last_conversation_date = $5,
                    preferred_payment_mode = $6, last_conversation_subject = $7
                WHERE id = $8
                RETURNING *;`;
            const updateResult = await pool.query(updateQuery, [name, country, address, dateCreated, lastConversationDateValue, preferredPaymentMode, lastConversationSubject, companyId]);
            console.log(`Updated ${updateResult.rowCount} rows for company ${companyId}.`);
            if (updateResult.rowCount === 0) {
                await pool.query('ROLLBACK');
                return res.status(404).json({ error: 'Company not found' });
            }

            console.log("Updated company:", updateResult.rows[0]);


            // Update or add domain
            if (domain) {
                const existingDomain = await pool.query('SELECT id FROM domains WHERE company_id = $1', [companyId]);
                if (existingDomain.rows.length > 0) {
                    await pool.query('UPDATE domains SET domain = $1 WHERE company_id = $2', [domain, companyId]);
                } else {
                    await pool.query('INSERT INTO domains (company_id, domain) VALUES ($1, $2)', [companyId, domain]);
                }
            }
    
            // Update or add employees
            const existingEmployees = (await pool.query('SELECT id FROM employees WHERE company_id = $1', [companyId])).rows;
            const existingEmployeeIds = existingEmployees.map(emp => emp.id);
    
            for (const employee of employees) {
                if (employee.id && existingEmployeeIds.includes(employee.id)) {
                    // Update existing employee
                    await pool.query(
                        'UPDATE employees SET name = $1, role = $2, email = $3, is_active = $4, linkedin_link = $5, should_mail = $6, notes = $7 WHERE id = $8',
                        [employee.name, employee.role, employee.email, employee.is_active, employee.linkedin_link, employee.should_mail, employee.notes, employee.id]
                    );
                } else {
                    // Insert new employee
                    await pool.query(
                        'INSERT INTO employees (company_id, name, role, email, is_active, linkedin_link, should_mail, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                        [companyId, employee.name, employee.role, employee.email, employee.is_active, employee.linkedin_link, employee.should_mail, employee.notes]
                    );
                }
            }
    
            // Delete employees not included in the update
            const updatedEmployeeIds = employees.filter(emp => emp.id).map(emp => emp.id);
            const employeesToDelete = existingEmployeeIds.filter(id => !updatedEmployeeIds.includes(id));
            for (const empId of employeesToDelete) {
                await pool.query('DELETE FROM employees WHERE id = $1', [empId]);
            }
    
            // Update or add service rates
            const existingRates = (await pool.query('SELECT id FROM service_rates WHERE company_id = $1', [companyId])).rows;
            const existingRateIds = existingRates.map(rate => rate.id);
    
            for (const rate of serviceRates) {
                if (rate.id && existingRateIds.includes(rate.id)) {
                    // Update existing rate
                    await pool.query(
                        'UPDATE service_rates SET service_name = $1, rate = $2, project_basis = $3 WHERE id = $4',
                        [rate.serviceId, rate.rate, rate.projectBasis, rate.id]
                    );
                } else {
                    // Insert new service rate
                    await pool.query(
                        'INSERT INTO service_rates (company_id, service_name, rate, project_basis) VALUES ($1, $2, $3, $4)',
                        [companyId, rate.serviceId, rate.rate, rate.projectBasis]
                    );
                }
            }
    
            // Delete service rates not included in the update
            const updatedRateIds = serviceRates.filter(rate => rate.id).map(rate => rate.id);
            const ratesToDelete = existingRateIds.filter(id => !updatedRateIds.includes(id));
            for (const rateId of ratesToDelete) {
                await pool.query('DELETE FROM service_rates WHERE id = $1', [rateId]);
            }
    
            await pool.query('COMMIT');
            res.json({ message: 'Company updated successfully', company: updateResult.rows[0] });
        } catch (err) {
            await pool.query('ROLLBACK');
            console.error('Update transaction failed, rolled back', err);
            console.error('Error details:', err);
            res.status(500).json({ error: 'Server Error', details: err.message });
        }
    });
    

// Example endpoint to fetch companies
app.get('/api/companies', async (req, res) => {
    console.log("Endpoint /api/companies called"); // Log when the endpoint is hit
    try {
        const companiesQuery = `
            SELECT c.*, 
                   json_agg(distinct e.*) as employees,
                   json_agg(distinct jsonb_build_object(
                    'id', sr.id,
                    'company_id', sr.company_id,
                    'service_name', sr.service_name,
                    'project_basis', sr.project_basis,
                    'rate', sr.rate
                )) as service_rates,
                    coalesce(json_agg(distinct d.domain) filter (where d.domain is not null), '[]') as domains,
                    coalesce(json_agg(distinct jsonb_build_object(
                    'id', ee.id,
                    'name', ee.name,
                    'email', ee.email
                )) filter (where ee.id is not null), '[]') as extracted_emails
            FROM companies c
            LEFT JOIN employees e ON e.company_id = c.id
            LEFT JOIN service_rates sr ON sr.company_id = c.id
            LEFT JOIN domains d ON d.company_id = c.id
            LEFT JOIN extracted_emails ee ON ee.domain_id = d.id
            GROUP BY c.id
            ORDER BY c.name;`;

        const result = await pool.query(companiesQuery);
        //console.log("Database query result:", result.rows); //Log the result from the database query
        res.json(result.rows.map(company => {
            // This will help ensure that if no employees or rates are present, we don't end up with null arrays
            company.employees = company.employees[0] ? company.employees : [];
            company.service_rates = company.service_rates[0] ? company.service_rates : [];
            company.domains = company.domains[0] ? company.domains : [];
            company.extracted_emails = company.extracted_emails[0] ? company.extracted_emails : [];
            return company;
        }));
    } catch (err) {
        console.error("Failed to fetch companies:", err);
        res.status(500).json({ error: 'Server Error', details: err.message }); // Return JSON-formatted error
    }
});

// Endpoint to delete a company by ID
app.delete('/api/companies/:id', async (req, res) => {
    const companyId = req.params.id;
    try {
        await pool.query('BEGIN');

        // Delete related records
        await pool.query('DELETE FROM domains WHERE company_id = $1', [companyId]);
        await pool.query('DELETE FROM employees WHERE company_id = $1', [companyId]);
        await pool.query('DELETE FROM service_rates WHERE company_id = $1', [companyId]);
        await pool.query('DELETE FROM extracted_emails WHERE domain_id IN (SELECT id FROM domains WHERE company_id = $1)', [companyId]);
        // Delete the company
        const deleteResult = await pool.query('DELETE FROM companies WHERE id = $1 RETURNING *', [companyId]);

        if (deleteResult.rowCount === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'Company not found' });
        }

        await pool.query('COMMIT');
        res.json({ message: 'Company deleted successfully', company: deleteResult.rows[0] });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Delete transaction failed, rolled back', err);
        res.status(500).json({ error: 'Server Error', details: err.message });
    }
});

async function extractNamesAndEmails(domain) {
    const oAuth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        process.env.GMAIL_REDIRECT_URI
    );

    oAuth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    });

    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

    const uniqueNames = new Set();
    const uniqueEmails = new Set();
    let latestDate = null;
    let latestSubject = '';

    // Search for emails from the specified domain
    try {
        const res = await gmail.users.messages.list({
            userId: 'me',
            q: `from:${domain}`,
        });

        const threads = res.data.messages || [];

        for (const thread of threads) {
            const message = await gmail.users.messages.get({
                userId: 'me',
                id: thread.id,
            });

            const headers = message.data.payload.headers;
            const fromHeader = headers.find(header => header.name === 'From');        
            const dateHeader = headers.find(header => header.name === 'Date');
            const subjectHeader = headers.find(header => header.name === 'Subject');
            if (fromHeader) {
                const sender = fromHeader.value;
                if (sender.indexOf(`@${domain}`) !== -1) {
                    if (sender.includes('<')) {
                        const name = sender.split('<')[0].trim();
                        const email = sender.split('<')[1].slice(0, -1);
                        if (!uniqueNames.has(name)) {
                            uniqueNames.add(name);
                        }
                        if (!uniqueEmails.has(email)) {
                            uniqueEmails.add(email);
                        }
                    } else {
                        const email = sender;
                        if (!uniqueEmails.has(email)) {
                            uniqueEmails.add(email);
                        }
                    }
                }
            }

            if (dateHeader) {
                const emailDate = new Date(dateHeader.value);
                if (!latestDate || emailDate > latestDate) {
                    latestDate = emailDate;
                    latestSubject = subjectHeader ? subjectHeader.value : '';
                }
            }
        }
    } catch (error) {
        console.error('Error extracting emails:', error);
        throw new Error('Failed to extract emails');
    }

    return {
        names: Array.from(uniqueNames),
        emails: Array.from(uniqueEmails),
        latestDate,
        latestSubject
    };
}

// Endpoint to add a new domain
app.post('/api/addDomain', async (req, res) => {
    const { companyId, domain } = req.body;
    if (!companyId || !domain) {
        return res.status(400).json({ error: 'Company ID and Domain are required' });
    }

    try {
        const existingDomain = await pool.query('SELECT id FROM domains WHERE company_id = $1 AND domain = $2', [companyId, domain]);
        if (existingDomain.rows.length > 0) {
            return res.status(400).json({ error: 'Domain already exists for this company' });
        }

        const result = await pool.query('INSERT INTO domains (company_id, domain) VALUES ($1, $2) RETURNING id', [companyId, domain]);
        res.json({ domainId: result.rows[0].id });
    } catch (err) {
        console.error("Failed to add domain:", err);
        res.status(500).json({ error: 'Server Error', details: err.message });
    }
});

app.post('/api/checkDomain', async (req, res) => {
    const { domain } = req.body;
    if (!domain) {
        return res.status(400).json({ error: 'Domain is required' });
    }

    try {
        const domainResult = await pool.query('SELECT company_id FROM domains WHERE domain = $1', [domain]);
        if (domainResult.rows.length > 0) {
            const companyId = domainResult.rows[0].company_id;
            const companyResult = await pool.query('SELECT * FROM companies WHERE id = $1', [companyId]);
            if (companyResult.rows.length > 0) {
                return res.json({ exists: true, company: companyResult.rows[0] });
            }
        }
        res.json({ exists: false });
    } catch (err) {
        console.error("Failed to check domain:", err);
        res.status(500).json({ error: 'Server Error', details: err.message });
    }
});

app.post('/api/companies/bulk-delete', async (req, res) => {
    const { ids } = req.body;
    console.log('Received IDs for bulk delete:', ids); // Log the received IDs

    if (!Array.isArray(ids) || ids.length === 0) {
        console.error('Invalid request, array of IDs is required:', ids); // Log the error
        return res.status(400).json({ error: 'Invalid request, array of IDs is required' });
    }

    // Convert IDs to integers
    const companyIds = ids.map(id => parseInt(id, 10));
    console.log('Parsed company IDs:', companyIds);

    try {
        await pool.query('BEGIN');
        await pool.query('DELETE FROM employees WHERE company_id = ANY($1::int[])', [companyIds]);
        await pool.query('DELETE FROM service_rates WHERE company_id = ANY($1::int[])', [companyIds]);
        await pool.query('DELETE FROM companies WHERE id = ANY($1::int[])', [companyIds]);
        await pool.query('COMMIT');
        res.json({ message: 'Companies deleted successfully' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Bulk delete transaction failed, rolled back', err);
        res.status(500).json({ error: 'Server Error', details: err.message });
    }
});



// Endpoint to extract names and emails based on domain
app.post('/api/extractEmails', async (req, res) => {
    const { domain } = req.body;
    if (!domain) {
        return res.status(400).json({ error: 'Domain is required' });
    }

    try {
        // Check if the domain exists in the database
        const domainResult = await pool.query('SELECT id, company_id FROM domains WHERE domain = $1', [domain]);
        let domainId;
        let companyId;
        
        if (domainResult.rows.length > 0) {
            domainId = domainResult.rows[0].id;
            companyId = domainResult.rows[0].company_id;
        } else {
            // Create a new company placeholder if it doesn't exist
            const companyResult = await pool.query(
                'INSERT INTO companies (name, type, address, country) VALUES ($1, $2, $3, $4) RETURNING id',
                ['New Company', 'unknown', '', '']
            );
            companyId = companyResult.rows[0].id;
            const newDomainResult = await pool.query('INSERT INTO domains (company_id, domain) VALUES ($1, $2) RETURNING id', [companyId, domain]);
            domainId = newDomainResult.rows[0].id;
        }

        const extractedData = await extractNamesAndEmails(domain);

        // Save extracted data to the database
        for (let i = 0; i < extractedData.names.length; i++) {
            const name = extractedData.names[i];
            const email = extractedData.emails[i];
            await pool.query(
                'INSERT INTO extracted_emails (domain_id, name, email) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
                [domainId, name, email]
            );
        }
        if (companyId && extractedData.latestDate) {
            await pool.query(
                'UPDATE companies SET last_conversation_date = $1, last_conversation_subject = $2 WHERE id = $3',
                [extractedData.latestDate, extractedData.latestSubject, companyId]
            );
        }

        res.json(extractedData);
    } catch (err) {
        console.error("Failed to extract emails:", err);
        res.status(500).json({ error: 'Server Error', details: err.message });
    }
});

////FOR VENDORS//

// Endpoint to fetch all vendors
app.get('/api/vendors', async (req, res) => {
    console.log("Endpoint /api/vendors called"); // Log when the endpoint is hit
    try {
        const vendorsQuery = `
            SELECT v.*,
                    json_agg(distinct vt.*) as teammates,
                    json_agg(distinct jsonb_build_object(
                    'id', vsr.id,
                    'vendor_id', vsr.vendor_id,
                    'service_name', vsr.service_name,
                    'project_basis', vsr.project_basis,
                    'rate', vsr.rate
                )) as service_rates
            FROM vendors v
            LEFT JOIN vendor_teammates vt ON vt.vendor_id = v.id
            LEFT JOIN vendor_service_rates vsr ON vsr.vendor_id = v.id
            GROUP BY v.id
            ORDER BY v.name;`;

        const result = await pool.query(vendorsQuery);        
        res.json(result.rows.map(vendor => {
            // This will help ensure that if no employees or rates are present, we don't end up with null arrays
            vendor.teammates = vendor.teammates[0] ? vendor.teammates : [];
            vendor.service_rates = vendor.service_rates[0] ? vendor.service_rates : [];
            return vendor;
        }));
        //console.log("Fetched vendors data:", JSON.stringify(result.rows, null, 2));
        //res.json(result.rows);        


    } catch (err) {
        console.error("Failed to fetch vendors:", err);
        res.status(500).json({ error: 'Server Error', details: err.message }); // Return JSON-formatted error
    }
});

// Endpoint to fetch a specific vendor by ID
app.get('/api/vendors/:id', async (req, res) => {
    const vendorId = req.params.id;
    try {
        const vendorQuery = `
           SELECT v.*,
                json_agg(distinct vt.*) as teammates,
                json_agg(distinct jsonb_build_object(
                    'id', vsr.id,
                    'vendor_id', vsr.vendor_id,
                    'service_name', vsr.service_name,
                    'project_basis', vsr.project_basis,
                    'rate', vsr.rate
                )) as service_rates
           FROM vendors v
           LEFT JOIN vendor_teammates vt ON vt.vendor_id = v.id
           LEFT JOIN vendor_service_rates vsr ON vsr.vendor_id = v.id
           WHERE v.id = $1
           GROUP BY v.id`;

        const result = await pool.query(vendorQuery, [vendorId]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: "Vendor not found" });
        }
    } catch (err) {
        console.error("Failed to fetch vendor:", err);
        res.status(500).json({ error: 'Server Error', details: err.message });
    }
});

// Endpoint to create a new vendor or update an existing vendor
app.route('/api/vendors/:id?')
    .post(async (req, res) => {
        const {
            name, address, dateCreated, paymentAtCompanyLevel, paymentDetails, gst, primaryPhone,
            teammates = [], // Default to an empty array if not provided
            serviceRates = [] // Default to an empty array if not provided
        } = req.body;

        console.log("Received company data:", req.body);  // Log the received data - This line could be deleted

        // Set dateCreated to today's date if it is empty
        const parsedDateCreated = dateCreated ? dateCreated : new Date().toISOString().split('T')[0];

        // Determine the type based on the country
        //const type = country === 'India' ? 'domestic' : 'international';

        console.log("Ready to insert:", {
            name, address, parsedDateCreated, paymentAtCompanyLevel, paymentDetails, gst, primaryPhone
        });    


        // Check for required fields
        if (!name || !address) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        try {
            console.log("Starting transaction for new vendor");
            // Start transaction
            await pool.query('BEGIN');
            const vendorResult = await pool.query(
                'INSERT INTO vendors (name, address, date_created, payment_at_company_level, payment_details, gst, primary_phone) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                [name, address, parsedDateCreated, paymentAtCompanyLevel, paymentDetails, gst, primaryPhone]
            );
            const vendorId = vendorResult.rows[0].id;

             // Insert into credentials table for vender
 await pool.query(
    'INSERT INTO credentials (user_type, user_id, password) VALUES ($1, $2, $3)',
    ['vender', vendorId.toString(), ''] // Use companyId for user_id
);

            console.log("Vendor inserted with ID:", vendorId); // Removable line

            // Insert teammates
            console.log("Inserting teammates data:", teammates); // Can be removed
            if (Array.isArray(teammates)) {
                for (const teammate of teammates) {
                    await pool.query(
                        'INSERT INTO vendor_teammates (vendor_id, names, pan_card_no, payment_details, email, phone, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                        [vendorId, teammate.names, teammate.panCardNo, teammate.paymentDetails, teammate.email, teammate.phone, teammate.notes]
                    );
                }
            }

            // Insert service rates - Check if employees data is iterable
            console.log("Inserting service rates data:", serviceRates); // Can be removed
            if (Array.isArray(serviceRates)) {
                for (const rate of serviceRates) {
                    const projectBasisValue = rate.projectBasis === true; // Convert to a boolean value
                    await pool.query(
                        'INSERT INTO vendor_service_rates (vendor_id, service_name, rate, project_basis) VALUES ($1, $2, $3, $4)',
                        [vendorId, rate.serviceId, rate.rate || null, projectBasisValue]
                    );
                }
            }

            // Commit transaction
            await pool.query('COMMIT');
            console.log("Transaction committed");
            res.status(201).json({ message: "Vendor and associated data added successfully!" });
        } catch (err) {
            // Rollback in case of error
            await pool.query('ROLLBACK');
            console.error("Transaction failed, rolled back", err); // Earlier this line was just this console.error(err.message);        
            res.status(500).send('Server Error');
        }
    })

    .put(async (req, res) => {
        const vendorId = req.params.id;
        if (!vendorId) {
            return res.status(400).json({ error: 'Vendor ID is required for update' });
        }
    
        const {
            name,
            address,
            dateCreated,
            paymentAtCompanyLevel,
            paymentDetails,
            gst,
            primaryPhone,
            teammates = [],
            serviceRates = []
        } = req.body;

        console.log("Received update for vendor:", vendorId, "with data:", req.body);
    
        try {
            await pool.query('BEGIN');
    
            // Update vendor details
            const updateQuery = `
                UPDATE vendors
                SET name = $1, address = $2, date_created = $3, payment_at_company_level = $4,
                    payment_details = $5, gst = $6, primary_phone = $7
                WHERE id = $8
                RETURNING *;`;
                const updateResult = await pool.query(updateQuery, [name, address, dateCreated, paymentAtCompanyLevel, paymentDetails, gst, primaryPhone, vendorId]);
                console.log(`Updated ${updateResult.rowCount} rows for vendor ${vendorId}.`);
                if (updateResult.rowCount === 0) {
                    await pool.query('ROLLBACK');
                    return res.status(404).json({ error: 'Vendor not found' });
                }

            console.log("Updated vendor:", updateResult.rows[0]);
    
            // Update or add teammates
            const existingTeammates = (await pool.query('SELECT id FROM vendor_teammates WHERE vendor_id = $1', [vendorId])).rows;
            const existingTeammateIds = existingTeammates.map(teammate => teammate.id);
    
            for (const teammate of teammates) {
                if (teammate.id && existingTeammateIds.includes(teammate.id)) {
                    // Update existing teammate
                    await pool.query(
                        'UPDATE vendor_teammates SET names = $1, pan_card_no = $2, payment_details = $3, email = $4, phone = $5, notes = $6 WHERE id = $7',
                        [teammate.names, teammate.panCardNo, teammate.paymentDetails, teammate.email, teammate.phone, teammate.notes, teammate.id]
                    );
                } else {
                    // Insert new teammate
                    await pool.query(
                        'INSERT INTO vendor_teammates (vendor_id, names, pan_card_no, payment_details, email, phone, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                        [vendorId, teammate.names, teammate.panCardNo, teammate.paymentDetails, teammate.email, teammate.phone, teammate.notes]
                    );
                }
            }
    
            // Delete teammates not included in the update
            const updatedTeammateIds = teammates.filter(teammate => teammate.id).map(teammate => teammate.id);
            const teammatesToDelete = existingTeammateIds.filter(id => !updatedTeammateIds.includes(id));
            for (const teammateId of teammatesToDelete) {
                await pool.query('DELETE FROM vendor_teammates WHERE id = $1', [teammateId]);
            }
    
            // Update or add service rates
            const existingRates = (await pool.query('SELECT id FROM vendor_service_rates WHERE vendor_id = $1', [vendorId])).rows;
            const existingRateIds = existingRates.map(rate => rate.id);
    
            for (const rate of serviceRates) {
                if (rate.id && existingRateIds.includes(rate.id)) {
                    // Update existing rate
                    await pool.query(
                        'UPDATE vendor_service_rates SET service_name = $1, rate = $2, project_basis = $3 WHERE id = $4',
                        [rate.serviceId, rate.rate, rate.projectBasis, rate.id]
                    );
                } else {
                    // Insert new service rate
                    await pool.query(
                        'INSERT INTO vendor_service_rates (vendor_id, service_name, rate, project_basis) VALUES ($1, $2, $3, $4)',
                        [vendorId, rate.serviceId, rate.rate, rate.projectBasis]
                    );
                }
            }
    
            // Delete service rates not included in the update
            const updatedRateIds = serviceRates.filter(rate => rate.id).map(rate => rate.id);
            const ratesToDelete = existingRateIds.filter(id => !updatedRateIds.includes(id));
            for (const rateId of ratesToDelete) {
                await pool.query('DELETE FROM vendor_service_rates WHERE id = $1', [rateId]);
            }
    
            await pool.query('COMMIT');
            res.json({ message: 'Vendor updated successfully', vendor: updateResult.rows[0] });
        } catch (err) {
            await pool.query('ROLLBACK');
            console.error('Update transaction failed, rolled back', err);
            res.status(500).json({ error: 'Server Error', details: err.message });
        }
    });
    
// Endpoint to delete a vendor by ID
app.delete('/api/vendors/:id', async (req, res) => {
    const vendorId = req.params.id;
    try {
        await pool.query('BEGIN');

        // Delete associated teammates and service rates
        await pool.query('DELETE FROM vendor_teammates WHERE vendor_id = $1', [vendorId]);
        await pool.query('DELETE FROM vendor_service_rates WHERE vendor_id = $1', [vendorId]);

        // Delete the vendor
        const deleteResult = await pool.query('DELETE FROM vendors WHERE id = $1 RETURNING *', [vendorId]);

        if (deleteResult.rowCount === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'Vendor not found' });
        }

        await pool.query('COMMIT');
        res.json({ message: 'Vendor deleted successfully', vendor: deleteResult.rows[0] });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Delete transaction failed, rolled back', err);
        res.status(500).json({ error: 'Server Error', details: err.message });
    }
});

// Endpoint to delete multiple vendors by IDs
app.post('/api/vendors/bulk-delete', async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Invalid request, array of IDs is required' });
    }

    // Convert IDs to integers
    const vendorIds = ids.map(id => parseInt(id, 10));

    try {
        await pool.query('BEGIN');
        await pool.query('DELETE FROM vendor_teammates WHERE vendor_id = ANY($1::int[])', [vendorIds]);
        await pool.query('DELETE FROM vendor_service_rates WHERE vendor_id = ANY($1::int[])', [vendorIds]);
        await pool.query('DELETE FROM vendors WHERE id = ANY($1::int[])', [vendorIds]);
        await pool.query('COMMIT');
        res.json({ message: 'Vendors deleted successfully' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Bulk delete transaction failed, rolled back', err);
        res.status(500).json({ error: 'Server Error', details: err.message });
    }
});


// PROJECTS

// Endpoint to fetch all projects
app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM projects');
        res.json(result.rows);
    } catch (err) {
        console.error("Failed to fetch projects:", err);
        res.status(500).send('Server Error');
    }
});

// Endpoint to fetch a specific project by ID
app.get('/api/projects/:id', async (req, res) => {
    const projectId = req.params.id;
    try {
        const projectQuery = `
            SELECT p.id, p.name, p.client_id, p.date_created, p.stage, p.notes,
                   b.id as batch_id, b.batch_date, b.vendor_id, b.is_finalized, -- Add is_finalized field
                   s.id as shot_id, s.shot_name, s.frame_count, s.client_cost, s.vendor_cost, s.vendor_id, s.service_id
            FROM projects p
            LEFT JOIN batches b ON b.project_id = p.id
            LEFT JOIN shots s ON s.batch_id = b.id
            WHERE p.id = $1
        `;
        const result = await pool.query(projectQuery, [projectId]);

        if (result.rows.length > 0) {
            // Assuming your query might return multiple rows for each shot, 
            // you need to format it into a structured JSON object.
            const projectData = {
                id: result.rows[0].id,
                name: result.rows[0].name,
                client_id: result.rows[0].client_id,
                date_created: result.rows[0].date_created,
                stage: result.rows[0].stage,
                notes: result.rows[0].notes,
                batches: []
            };

            result.rows.forEach(row => {
                let batch = projectData.batches.find(b => b.id === row.batch_id);
                if (!batch) {
                    batch = {
                        id: row.batch_id,
                        batch_date: row.batch_date,
                        vendor_id: row.vendor_id,
                        is_finalized: row.is_finalized,
                        shots: []
                    };
                    projectData.batches.push(batch);
                }

                batch.shots.push({
                    id: row.shot_id,
                    shot_name: row.shot_name,
                    frame_count: row.frame_count,
                    client_cost: row.client_cost,
                    vendor_cost: row.vendor_cost,
                    vendor_id: row.vendor_id,
                    service_id: row.service_id
                });
            });

            res.json(projectData);
        } else {
            res.status(404).json({ error: "Project not found" });
        }
    } catch (err) {
        console.error("Failed to fetch project:", err);
        res.status(500).send('Server Error');
    }
});

// Endpoint to create a new project with batches and shots
app.post('/api/projects', async (req, res) => {
    const client = await pool.connect();
    const { name, client_id, date_created, stage, notes, vendors, batches } = req.body;

    try {
        await pool.query('BEGIN');

        // Insert project
        const projectResult = await pool.query(
            'INSERT INTO projects (name, client_id, date_created, stage, notes) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name, client_id, date_created, stage, notes]
        );
        const projectId = projectResult.rows[0].id;

        // Associate vendors if provided
        if (Array.isArray(vendors) && vendors.length > 0) {
            for (const vendorId of vendors) {
                await pool.query('INSERT INTO project_vendors (project_id, vendor_id) VALUES ($1, $2)', [projectId, vendorId]);
            }
        }

        // Insert batches and shots
        if (Array.isArray(batches) && batches.length > 0) {
            for (const batch of batches) {
                const batchResult = await pool.query(
                    'INSERT INTO batches (project_id, batch_date, vendor_id, is_finalized) VALUES ($1, $2, $3, $4) RETURNING id',
                    [projectId, batch.batchDate, batch.vendorId, batch.is_finalized || false]
                );
                const batchId = batchResult.rows[0].id;

                if (Array.isArray(batch.shots) && batch.shots.length > 0) {
                    for (const shot of batch.shots) {
                        await pool.query(
                            'INSERT INTO shots (batch_id, shot_name, frame_count, client_cost, vendor_cost, vendor_id, service_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                            [batchId, shot.shotName, shot.frameCount, shot.clientCost, shot.vendorCost, shot.vendorId, shot.serviceId]
                        );
                    }
                }
            }
        }

        await pool.query('COMMIT');
        res.status(201).json(projectResult.rows[0]);
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("Failed to create project:", err);
        res.status(500).send('Server Error');
    } finally {
        client.release();
    }
});

// Endpoint to update a project
app.put('/api/projects/:id', async (req, res) => {
    const projectId = req.params.id;
    const { name, client_id, date_created, stage, notes, vendors, batches } = req.body;
    try {
        await pool.query('BEGIN');

        // Update project details
        const projectResult = await pool.query(
            'UPDATE projects SET name = $1, client_id = $2, date_created = $3, stage = $4, notes = $5 WHERE id = $6 RETURNING *',
            [name, client_id, date_created, stage, notes, projectId]
        );

        // Update vendors if provided
        if (Array.isArray(vendors) && vendors.length > 0) {
            await pool.query('DELETE FROM project_vendors WHERE project_id = $1', [projectId]);
            for (const vendorId of vendors) {
                await pool.query('INSERT INTO project_vendors (project_id, vendor_id) VALUES ($1, $2)', [projectId, vendorId]);
            }
        }

        // Update batches and shots
        if (Array.isArray(batches) && batches.length > 0) {
            // Delete existing batches and shots
            const batchIdsResult = await pool.query('SELECT id FROM batches WHERE project_id = $1', [projectId]);
            const batchIds = batchIdsResult.rows.map(row => row.id);
            if (batchIds.length > 0) {
                await pool.query('DELETE FROM shots WHERE batch_id = ANY($1)', [batchIds]);
                await pool.query('DELETE FROM batches WHERE project_id = $1', [projectId]);
            }

            // Insert new batches and shots
            for (const batch of batches) {
                const batchResult = await pool.query(
                    'INSERT INTO batches (project_id, batch_date, vendor_id, is_finalized) VALUES ($1, $2, $3, $4) RETURNING id',
                    [projectId, batch.batchDate, batch.vendorId, batch.is_finalized || false]
                );
                const batchId = batchResult.rows[0].id;

                if (Array.isArray(batch.shots) && batch.shots.length > 0) {
                    for (const shot of batch.shots) {
                        const serviceId = shot.serviceId || null; // Ensure serviceId is passed correctly
                        await pool.query(
                            'INSERT INTO shots (batch_id, shot_name, frame_count, client_cost, vendor_cost, vendor_id, service_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                            [batchId, shot.shotName, shot.frameCount, shot.clientCost, shot.vendorCost, shot.vendorId, serviceId]
                        );
                    }
                }
            }
        }

        await pool.query('COMMIT');
        if (projectResult.rows.length > 0) {
            res.json(projectResult.rows[0]);
        } else {
            res.status(404).json({ error: "Project not found" });
        }
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("Failed to update project:", err);
        res.status(500).send('Server Error');
    }
});

// Fetch batches and shots for a project
app.get('/api/projects/:projectId/batches', async (req, res) => {
    const { projectId } = req.params;

    try {
        const result = await pool.query(
            `SELECT b.*, json_agg(s.*) as shots 
             FROM batches b 
             LEFT JOIN shots s ON s.batch_id = b.id 
             WHERE b.project_id = $1 
             GROUP BY b.id`,
            [projectId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Failed to fetch batches and shots:', err);
        res.status(500).json({ error: 'Server Error', details: err.message });
    }
});

// Endpoint to delete a project
app.delete('/api/projects/:id', async (req, res) => {
    const projectId = req.params.id;
    try {
        await pool.query('BEGIN');

        // Delete related records
        const batchIdsResult = await pool.query('SELECT id FROM batches WHERE project_id = $1', [projectId]);
        const batchIds = batchIdsResult.rows.map(row => row.id);
        if (batchIds.length > 0) {
            await pool.query('DELETE FROM shots WHERE batch_id = ANY($1)', [batchIds]);
            await pool.query('DELETE FROM batches WHERE project_id = $1', [projectId]);
        }
        await pool.query('DELETE FROM project_vendors WHERE project_id = $1', [projectId]);
        const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING *', [projectId]);
        await pool.query('COMMIT');
        if (result.rows.length > 0) {
            res.json({ message: 'Project deleted successfully', project: result.rows[0] });
        } else {
            res.status(404).json({ error: 'Project not found' });
        }
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("Failed to delete project:", err);
        res.status(500).send('Server Error');
    }
});

// FILE SYSTEM

// Configure Multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    try {
        res.status(200).json({ message: 'File uploaded successfully', file: req.file });
    } catch (error) {
        res.status(500).json({ message: 'File upload failed', error });
    }
});

// File download endpoint
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'uploads', filename);
    res.download(filepath, (err) => {
        if (err) {
            res.status(500).json({ message: 'File download failed', error: err.message });
        }
    });
});


io.on('connection', (socket) => {
    console.log('New client connected');
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});