RML SALES VISIT v1.8.0 - WEB GITHUB PACKAGE

Upload the contents of this folder to the GitHub repository root.

Main files:
- index.html
- app-v1-8-0.js
- customers-v0-10-3.js
- style-v1-7-6.css
- pdf-preview.html

The application uses Supabase for login, customers, products, assignments and visit synchronization.
The first visit sync uses the v1.8.0 initial limit of 5000; later synchronization uses delta sync.

Before using area assignment synchronization, run the required area-assignment SQL in Supabase.
