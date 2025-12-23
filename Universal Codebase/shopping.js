// TheeCoin Shopping functionality for terminal wallet
import { promptUser } from './wallet.js';
import { state } from './client.js';
import https from 'https';
import fs from 'fs';

// Enhanced shopping categories covering everything
const SHOPPING_CATEGORIES = {
    'Electronics & Technology': [
        'Smartphones & Tablets', 'Computers & Laptops', 'Gaming Consoles & Games',
        'Audio & Headphones', 'Cameras & Photography', 'Smart Home & IoT',
        'Wearable Technology', 'TV & Entertainment', 'Networking & Internet',
        'Electronic Components', 'Software & Digital Products'
    ],
    'Vehicles & Transportation': [
        'Cars & Trucks', 'Motorcycles & Scooters', 'Boats & Watercraft',
        'Aircraft & Aviation', 'Bicycles & E-bikes', 'Auto Parts & Accessories',
        'Tires & Wheels', 'Car Audio & Electronics', 'Trailers & RVs',
        'Commercial Vehicles', 'Electric Vehicles'
    ],
    'Home & Garden': [
        'Furniture & Decor', 'Appliances & Electronics', 'Tools & Hardware',
        'Garden & Outdoor', 'Kitchen & Dining', 'Bedding & Bath',
        'Lighting & Electrical', 'Flooring & Tiles', 'Paint & Supplies',
        'Security & Safety', 'Storage & Organization'
    ],
    'Fashion & Beauty': [
        'Clothing & Apparel', 'Shoes & Footwear', 'Bags & Accessories',
        'Jewelry & Watches', 'Beauty & Cosmetics', 'Hair Care & Styling',
        'Fragrances & Perfumes', 'Sunglasses & Eyewear', 'Wedding & Formal',
        'Vintage & Designer', 'Plus Size & Specialty'
    ],
    'Health & Wellness': [
        'Fitness Equipment', 'Supplements & Nutrition', 'Medical Equipment',
        'Mental Health Services', 'Alternative Medicine', 'Dental Care',
        'Vision Care', 'Personal Care', 'Therapy & Counseling',
        'Wellness Programs', 'Health Monitoring'
    ],
    'Sports & Recreation': [
        'Exercise & Fitness', 'Outdoor & Camping', 'Water Sports',
        'Winter Sports', 'Team Sports', 'Individual Sports',
        'Hunting & Fishing', 'Cycling & Running', 'Martial Arts',
        'Adventure Sports', 'Sports Memorabilia'
    ],
    'Education & Learning': [
        'Books & Textbooks', 'Online Courses', 'Tutoring & Teaching',
        'Educational Software', 'School Supplies', 'Musical Instruments',
        'Art Supplies', 'Science & Lab Equipment', 'Language Learning',
        'Professional Development', 'Certification Programs'
    ],
    'Business & Professional': [
        'Office Equipment', 'Business Services', 'Industrial Equipment',
        'Professional Tools', 'Consulting Services', 'Marketing & Advertising',
        'Legal Services', 'Accounting & Finance', 'IT Services',
        'Manufacturing Equipment', 'Wholesale & Bulk'
    ],
    'Entertainment & Media': [
        'Movies & TV Shows', 'Music & Audio', 'Books & Literature',
        'Gaming & Esports', 'Streaming Services', 'Event Tickets',
        'Musical Instruments', 'Art & Collectibles', 'Photography Services',
        'Video Production', 'Podcasting Equipment'
    ],
    'Food & Beverages': [
        'Restaurants & Dining', 'Grocery & Food Items', 'Beverages & Drinks',
        'Cooking & Baking', 'Food Delivery', 'Catering Services',
        'Specialty Foods', 'Organic & Natural', 'International Cuisine',
        'Food Equipment', 'Meal Planning'
    ],
    'Travel & Tourism': [
        'Flights & Airlines', 'Hotels & Lodging', 'Car Rentals',
        'Travel Packages', 'Tour Guides', 'Travel Insurance',
        'Luggage & Travel Gear', 'Travel Planning', 'Adventure Tours',
        'Cultural Experiences', 'Travel Photography'
    ],
    'Real Estate & Housing': [
        'Houses for Sale', 'Apartments for Rent', 'Commercial Properties',
        'Land & Lots', 'Vacation Rentals', 'Property Management',
        'Real Estate Services', 'Moving Services', 'Home Inspection',
        'Mortgage & Financing', 'Property Investment'
    ],
    'Jobs & Employment': [
        'Full-time Jobs', 'Part-time Jobs', 'Freelance & Gig Work',
        'Remote Work', 'Internships', 'Contract Work',
        'Executive Positions', 'Entry Level', 'Skilled Trades',
        'Creative Jobs', 'Technology Jobs'
    ],
    'Services & Maintenance': [
        'Home Repair & Maintenance', 'Cleaning Services', 'Landscaping & Lawn Care',
        'Pet Services', 'Personal Services', 'Event Planning',
        'Photography & Video', 'Transportation Services', 'Delivery Services',
        'Installation Services', 'Repair Services'
    ],
    'Baby & Kids': [
        'Baby Gear & Equipment', 'Toys & Games', 'Children Clothing',
        'Educational Toys', 'Baby Food & Care', 'Strollers & Car Seats',
        'Nursery Furniture', 'Childcare Services', 'Kids Activities',
        'School Supplies', 'Teen Products'
    ],
    'Pets & Animals': [
        'Dogs & Puppies', 'Cats & Kittens', 'Birds & Poultry',
        'Fish & Aquariums', 'Small Animals', 'Reptiles & Amphibians',
        'Pet Supplies', 'Pet Services', 'Livestock & Farm Animals',
        'Pet Training', 'Veterinary Services'
    ],
    'Hobbies & Crafts': [
        'Arts & Crafts Supplies', 'Model Building', 'Collecting',
        'Sewing & Textiles', 'Woodworking', 'Metalworking',
        'Electronics Projects', 'Gardening Supplies', 'Cooking & Baking',
        'Photography', 'Music & Instruments'
    ],
    'Free Items': [
        'Free Furniture', 'Free Electronics', 'Free Clothing',
        'Free Books', 'Free Household Items', 'Free Garden Items',
        'Free Building Materials', 'Free Office Supplies', 'Free Toys',
        'Free Pet Supplies', 'Free Miscellaneous'
    ],
    'Miscellaneous': [
        'Antiques & Vintage', 'Religious Items', 'Party Supplies',
        'Wedding Items', 'Seasonal Items', 'Storage Units',
        'Tickets & Vouchers', 'Gift Cards', 'Bulk Items',
        'Unusual Items', 'Everything Else'
    ]
};

// imgbb API configuration
const IMGBB_API_KEY = '60cf7500721ed045c5bd165bfd46498b';

// Main shopping menu
export async function HandleShoppingMenu(wallet) {
    while (true) {
        console.log("\n=== TheeCoin Shopping Marketplace ===");
        console.log("🔍 1. Explore Listings");
        console.log("📝 2. Post Listing(s)");
        console.log("📋 3. My Listings");
        console.log("📊 4. Categories");
        console.log("🌍 5. Local Listings");
        console.log("🔙 6. Back to Main Menu");

        const choice = await promptUser("\nChoose an option: ");

        switch (choice) {
            case "1":
                await ExploreListings();
                break;
            case "2":
                await PostListings(wallet);
                break;
            case "3":
                await ViewMyListings(wallet);
                break;
            case "4":
                await BrowseByCategory();
                break;
            case "5":
                await BrowseLocalListings();
                break;
            case "6":
                return;
            default:
                console.log("Invalid choice. Please try again.");
        }
    }
}

// Explore listings from the network with advanced filtering
async function ExploreListings() {
    console.log("\n=== Explore TheeCoin Marketplace ===");

    while (true) {
        console.log("\n1. View All Listings");
        console.log("2. Search Listings");
        console.log("3. Filter by Category");
        console.log("4. Filter by Location");
        console.log("5. Filter by Price Range");
        console.log("6. Advanced Filters");
        console.log("7. Back to Shopping Menu");

        const choice = await promptUser("\nChoose an option: ");

        switch (choice) {
            case "1":
                await ViewAllListings();
                break;
            case "2":
                await SearchListings();
                break;
            case "3":
                await FilterByCategory();
                break;
            case "4":
                await FilterByLocation();
                break;
            case "5":
                await FilterByPriceRange();
                break;
            case "6":
                await AdvancedFilters();
                break;
            case "7":
                return;
            default:
                console.log("Invalid choice. Please try again.");
        }
    }
}

// View all listings with basic display
async function ViewAllListings() {
    console.log("Loading listings from network...");

    try {
        const response = await sendAPIRequest('api_shopping_listings', {});

        if (!response || response.status !== 'ok') {
            console.log("Error: Unable to fetch listings from network");
            await promptUser("\nPress Enter to continue...");
            return;
        }

        const listings = response.listings || [];

        if (listings.length === 0) {
            console.log("\nNo listings found on the network.");
            console.log("Be the first to post a listing!");
            await promptUser("\nPress Enter to continue...");
            return;
        }

        await DisplayListings(listings, "All Listings");

    } catch (error) {
        console.log(`Error loading listings: ${error.message}`);
        await promptUser("\nPress Enter to continue...");
    }
}

// Listing display function with preview/full view system
async function DisplayListings(listings, title = "Listings") {
    console.log(`\n=== ${title} (${listings.length} found) ===\n`);

    if (listings.length === 0) {
        console.log("No listings match your criteria.");
        await promptUser("\nPress Enter to continue...");
        return;
    }

    // Sort listings by timestamp (newest first)
    listings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Display listing previews
    for (let i = 0; i < listings.length; i++) {
        const listing = listings[i];
        console.log(`━━━ Listing ${i + 1} ━━━`);
        console.log(`📝 Title: ${listing.title}`);

        // Show category if available
        if (listing.category) {
            console.log(`📂 Category: ${listing.category}${listing.subcategory ? ` > ${listing.subcategory}` : ''}`);
        }

        // Show price and condition on same line
        let priceConditionLine = '';
        if (listing.price && listing.price.trim() !== '') {
            let displayPrice = listing.price;
            // Add $ if it's a number and doesn't already have currency symbol
            if (/^\d+(\.\d{2})?$/.test(listing.price.trim())) {
                displayPrice = `$${listing.price}`;
            }
            priceConditionLine += `💰 Price: ${displayPrice}`;
        }
        if (listing.condition) {
            if (priceConditionLine) priceConditionLine += ` (${listing.condition})`;
            else priceConditionLine += `🔧 Condition: ${listing.condition}`;
        }
        if (priceConditionLine) console.log(priceConditionLine);

        // Show location type
        if (listing.locationType) {
            console.log(`📍 Type: ${listing.locationType.toUpperCase()}`);
        }

        // Show location if available
        if (listing.location) {
            console.log(`🌍 Location: ${listing.location}`);
        }

        console.log(`📅 Posted on: ${new Date(listing.timestamp).toLocaleString()}`);
        console.log("");
    }

    // Allow user to select a listing for full view
    const choice = await promptUser(`Enter listing number (1-${listings.length}) or just press Enter to go back: `);

    if (choice.trim() !== '') {
        const listingIndex = parseInt(choice) - 1;
        if (listingIndex >= 0 && listingIndex < listings.length) {
            await DisplayFullListing(listings[listingIndex]);
            // After viewing full listing, show the list again
            await DisplayListings(listings, title);
        } else {
            console.log("Invalid listing number.");
            await DisplayListings(listings, title);
        }
    }
}

// Display full listing details
async function DisplayFullListing(listing) {
    console.log(`\n=== Full Listing Details ===\n`);

    console.log(`📝 Title: ${listing.title}`);

    // Show category if available
    if (listing.category) {
        console.log(`📂 Category: ${listing.category}${listing.subcategory ? ` > ${listing.subcategory}` : ''}`);
    }

    // Show price if available
    if (listing.price && listing.price.trim() !== '') {
        let displayPrice = listing.price;
        // Add $ if it's a number and doesn't already have currency symbol
        if (/^\d+(\.\d{2})?$/.test(listing.price.trim())) {
            displayPrice = `$${listing.price}`;
        }
        console.log(`💰 Price: ${displayPrice}`);
    }

    // Show location info
    if (listing.locationType) {
        console.log(`📍 Type: ${listing.locationType}`);
        if (listing.location) {
            console.log(`🌍 Location: ${listing.location}`);
        }
        if (listing.zipCode && listing.locationType === 'local') {
            console.log(`📮 ZIP Code: ${listing.zipCode}`);
        }
    }

    // Show condition if available
    if (listing.condition) {
        console.log(`🔧 Condition: ${listing.condition}`);
    }

    console.log(`📄 Description: ${listing.description}`);

    // Show images if available (URLs only, no ASCII box)
    if (listing.images && listing.images.length > 0) {
        console.log(`🖼️  Images (${listing.images.length}):`);
        for (let j = 0; j < listing.images.length; j++) {
            console.log(`   ${j + 1}. ${listing.images[j]}`);
        }

        // No instruction text needed - URLs are already shown above
    }

    if (listing.link) console.log(`🔗 Store/Product Link: ${listing.link}`);
    if (listing.contact) console.log(`📞 Contact: ${listing.contact}`);

    console.log(`👤 Posted by: ${listing.walletAddress}`);
    console.log(`📅 Posted on: ${new Date(listing.timestamp).toLocaleString()}`);

    // Show view count if available
    if (listing.views) {
        console.log(`👁️  Views: ${listing.views}`);
    }

    await promptUser("\nPress Enter to go back to listings...");
}

// Display user's own listings (without "Posted by" field)
async function DisplayMyOwnListings(listings, title = "My Listings") {
    console.log(`\n=== ${title} (${listings.length} found) ===\n`);

    if (listings.length === 0) {
        console.log("No listings match your criteria.");
        await promptUser("\nPress Enter to continue...");
        return;
    }

    // Sort listings by timestamp (newest first)
    listings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Display listing previews
    for (let i = 0; i < listings.length; i++) {
        const listing = listings[i];
        console.log(`━━━ Listing ${i + 1} ━━━`);
        console.log(`📝 Title: ${listing.title}`);

        // Show category if available
        if (listing.category) {
            console.log(`📂 Category: ${listing.category}${listing.subcategory ? ` > ${listing.subcategory}` : ''}`);
        }

        // Show price and condition on same line
        let priceConditionLine = '';
        if (listing.price && listing.price.trim() !== '') {
            let displayPrice = listing.price;
            // Add $ if it's a number and doesn't already have currency symbol
            if (/^\d+(\.\d{2})?$/.test(listing.price.trim())) {
                displayPrice = `$${listing.price}`;
            }
            priceConditionLine += `💰 Price: ${displayPrice}`;
        }
        if (listing.condition) {
            if (priceConditionLine) priceConditionLine += ` (${listing.condition})`;
            else priceConditionLine += `🔧 Condition: ${listing.condition}`;
        }
        if (priceConditionLine) console.log(priceConditionLine);

        // Show location type
        if (listing.locationType) {
            console.log(`📍 Type: ${listing.locationType.toUpperCase()}`);
        }

        // Show location if available
        if (listing.location) {
            console.log(`🌍 Location: ${listing.location}`);
        }

        console.log(`📅 Posted on: ${new Date(listing.timestamp).toLocaleString()}`);
        console.log("");
    }

    // Allow user to select a listing for full view
    const choice = await promptUser(`Enter listing number (1-${listings.length}) to view details, or press Enter to continue: `);

    if (choice.trim() !== '') {
        const listingIndex = parseInt(choice) - 1;
        if (listingIndex >= 0 && listingIndex < listings.length) {
            await DisplayMyFullListing(listings[listingIndex]);
            // After viewing full listing, show the list again
            await DisplayMyOwnListings(listings, title);
        } else {
            console.log("Invalid listing number.");
            await DisplayMyOwnListings(listings, title);
        }
    }
}

// Display full listing details for user's own listing (without "Posted by")
async function DisplayMyFullListing(listing) {
    console.log(`\n=== Full Listing Details ===\n`);

    console.log(`📝 Title: ${listing.title}`);

    // Show category if available
    if (listing.category) {
        console.log(`📂 Category: ${listing.category}${listing.subcategory ? ` > ${listing.subcategory}` : ''}`);
    }

    // Show price if available
    if (listing.price && listing.price.trim() !== '') {
        let displayPrice = listing.price;
        // Add $ if it's a number and doesn't already have currency symbol
        if (/^\d+(\.\d{2})?$/.test(listing.price.trim())) {
            displayPrice = `$${listing.price}`;
        }
        console.log(`💰 Price: ${displayPrice}`);
    }

    // Show location info
    if (listing.locationType) {
        console.log(`📍 Type: ${listing.locationType}`);
        if (listing.location) {
            console.log(`🌍 Location: ${listing.location}`);
        }
        if (listing.zipCode && listing.locationType === 'local') {
            console.log(`📮 ZIP Code: ${listing.zipCode}`);
        }
    }

    // Show condition if available
    if (listing.condition) {
        console.log(`🔧 Condition: ${listing.condition}`);
    }

    console.log(`📄 Description: ${listing.description}`);

    // Show images if available (URLs only, no instruction text)
    if (listing.images && listing.images.length > 0) {
        console.log(`🖼️  Images (${listing.images.length}):`);
        for (let j = 0; j < listing.images.length; j++) {
            console.log(`   ${j + 1}. ${listing.images[j]}`);
        }
    }

    if (listing.link) console.log(`🔗 Store/Product Link: ${listing.link}`);
    if (listing.contact) console.log(`📞 Contact: ${listing.contact}`);

    // Don't show "Posted by" since it's the user's own listing
    console.log(`📅 Posted on: ${new Date(listing.timestamp).toLocaleString()}`);

    // Show view count if available
    if (listing.views) {
        console.log(`👁️  Views: ${listing.views}`);
    }

    await promptUser("\nPress Enter to go back to listings...");
}

// Search listings by keyword
async function SearchListings() {
    console.log("\n=== Search Listings ===");

    const searchTerm = await promptUser("Enter search term (title, description, tags): ");
    if (!searchTerm.trim()) {
        console.log("Search term cannot be empty.");
        return;
    }

    try {
        const response = await sendAPIRequest('api_shopping_search', {
            searchTerm: searchTerm.trim()
        });

        if (!response || response.status !== 'ok') {
            console.log("Error: Unable to search listings");
            await promptUser("\nPress Enter to continue...");
            return;
        }

        const listings = response.listings || [];
        await DisplayListings(listings, `Search Results for "${searchTerm}"`);

    } catch (error) {
        console.log(`Error searching listings: ${error.message}`);
        await promptUser("\nPress Enter to continue...");
    }
}

// Filter listings by category
async function FilterByCategory() {
    console.log("\n=== Filter by Category ===");

    const categories = Object.keys(SHOPPING_CATEGORIES);

    console.log("\nAvailable Categories:");
    for (let i = 0; i < categories.length; i++) {
        console.log(`${i + 1}. ${categories[i]}`);
    }

    const choice = await promptUser(`\nSelect category (1-${categories.length}) or 'cancel': `);

    if (choice.toLowerCase() === 'cancel') {
        return;
    }

    const categoryIndex = parseInt(choice) - 1;
    if (categoryIndex < 0 || categoryIndex >= categories.length) {
        console.log("Invalid selection.");
        return;
    }

    const selectedCategory = categories[categoryIndex];

    // Ask for subcategory
    const subcategories = SHOPPING_CATEGORIES[selectedCategory];
    console.log(`\nSubcategories for ${selectedCategory}:`);
    console.log("0. All subcategories");
    for (let i = 0; i < subcategories.length; i++) {
        console.log(`${i + 1}. ${subcategories[i]}`);
    }

    const subChoice = await promptUser(`\nSelect subcategory (0-${subcategories.length}) or 'cancel': `);

    if (subChoice.toLowerCase() === 'cancel') {
        return;
    }

    const subIndex = parseInt(subChoice);
    if (subIndex < 0 || subIndex > subcategories.length) {
        console.log("Invalid selection.");
        return;
    }

    const selectedSubcategory = subIndex === 0 ? null : subcategories[subIndex - 1];

    try {
        const response = await sendAPIRequest('api_shopping_filter', {
            category: selectedCategory,
            subcategory: selectedSubcategory
        });

        if (!response || response.status !== 'ok') {
            console.log("Error: Unable to filter listings");
            await promptUser("\nPress Enter to continue...");
            return;
        }

        const listings = response.listings || [];
        const title = selectedSubcategory ?
            `${selectedCategory} > ${selectedSubcategory}` :
            selectedCategory;
        await DisplayListings(listings, title);

    } catch (error) {
        console.log(`Error filtering listings: ${error.message}`);
        await promptUser("\nPress Enter to continue...");
    }
}

// Filter listings by location
async function FilterByLocation() {
    console.log("\n=== Filter by Location ===");

    console.log("1. Local listings only");
    console.log("2. Remote listings only");
    console.log("3. Filter by ZIP code");
    console.log("4. Cancel");

    const choice = await promptUser("\nChoose an option: ");

    let filterData = {};

    switch (choice) {
        case "1":
            filterData.locationType = 'local';
            break;
        case "2":
            filterData.locationType = 'remote';
            break;
        case "3":
            const zipCode = await promptUser("Enter ZIP code: ");
            if (!zipCode.trim()) {
                console.log("ZIP code cannot be empty.");
                return;
            }
            filterData.zipCode = zipCode.trim();
            break;
        case "4":
            return;
        default:
            console.log("Invalid choice.");
            return;
    }

    try {
        const response = await sendAPIRequest('api_shopping_filter_location', filterData);

        if (!response || response.status !== 'ok') {
            console.log("Error: Unable to filter listings by location");
            await promptUser("\nPress Enter to continue...");
            return;
        }

        const listings = response.listings || [];
        let title = "Location Filtered Listings";
        if (filterData.locationType) {
            title = `${filterData.locationType.charAt(0).toUpperCase() + filterData.locationType.slice(1)} Listings`;
        } else if (filterData.zipCode) {
            title = `Listings near ${filterData.zipCode}`;
        }

        await DisplayListings(listings, title);

    } catch (error) {
        console.log(`Error filtering by location: ${error.message}`);
        await promptUser("\nPress Enter to continue...");
    }
}

// Filter listings by price range
async function FilterByPriceRange() {
    console.log("\n=== Filter by Price Range ===");

    console.log("1. Free items only");
    console.log("2. Under $50");
    console.log("3. $50 - $200");
    console.log("4. $200 - $500");
    console.log("5. $500 - $1000");
    console.log("6. Over $1000");
    console.log("7. Custom range");
    console.log("8. Cancel");

    const choice = await promptUser("\nChoose an option: ");

    let minPrice = null;
    let maxPrice = null;
    let title = "Price Filtered Listings";

    switch (choice) {
        case "1":
            minPrice = 0;
            maxPrice = 0;
            title = "Free Items";
            break;
        case "2":
            minPrice = 0;
            maxPrice = 50;
            title = "Items Under $50";
            break;
        case "3":
            minPrice = 50;
            maxPrice = 200;
            title = "Items $50 - $200";
            break;
        case "4":
            minPrice = 200;
            maxPrice = 500;
            title = "Items $200 - $500";
            break;
        case "5":
            minPrice = 500;
            maxPrice = 1000;
            title = "Items $500 - $1000";
            break;
        case "6":
            minPrice = 1000;
            maxPrice = null;
            title = "Items Over $1000";
            break;
        case "7":
            const minInput = await promptUser("Enter minimum price (or 0 for no minimum): ");
            const maxInput = await promptUser("Enter maximum price (or leave empty for no maximum): ");

            minPrice = parseFloat(minInput) || 0;
            maxPrice = maxInput.trim() ? parseFloat(maxInput) : null;

            if (isNaN(minPrice) || (maxPrice !== null && isNaN(maxPrice))) {
                console.log("Invalid price range.");
                return;
            }

            title = `Items $${minPrice}${maxPrice ? ` - $${maxPrice}` : '+'}`;
            break;
        case "8":
            return;
        default:
            console.log("Invalid choice.");
            return;
    }

    try {
        const response = await sendAPIRequest('api_shopping_filter_price', {
            minPrice,
            maxPrice
        });

        if (!response || response.status !== 'ok') {
            console.log("Error: Unable to filter listings by price");
            await promptUser("\nPress Enter to continue...");
            return;
        }

        const listings = response.listings || [];
        await DisplayListings(listings, title);

    } catch (error) {
        console.log(`Error filtering by price: ${error.message}`);
        await promptUser("\nPress Enter to continue...");
    }
}

// Advanced filters combining multiple criteria
async function AdvancedFilters() {
    console.log("\n=== Advanced Filters ===");

    const filters = {};

    // Search term
    const searchTerm = await promptUser("Search term (optional, press Enter to skip): ");
    if (searchTerm.trim()) {
        filters.searchTerm = searchTerm.trim();
    }

    // Category filter
    const useCategory = await promptUser("Filter by category? (y/n): ");
    if (useCategory.toLowerCase() === 'y' || useCategory.toLowerCase() === 'yes') {
        const categories = Object.keys(SHOPPING_CATEGORIES);
        console.log("\nCategories:");
        for (let i = 0; i < categories.length; i++) {
            console.log(`${i + 1}. ${categories[i]}`);
        }

        const catChoice = await promptUser(`Select category (1-${categories.length}): `);
        const catIndex = parseInt(catChoice) - 1;
        if (catIndex >= 0 && catIndex < categories.length) {
            filters.category = categories[catIndex];
        }
    }

    // Location filter
    const useLocation = await promptUser("Filter by location? (y/n): ");
    if (useLocation.toLowerCase() === 'y' || useLocation.toLowerCase() === 'yes') {
        console.log("1. Local only");
        console.log("2. Remote only");
        console.log("3. Specific ZIP code");

        const locChoice = await promptUser("Choose location filter: ");
        switch (locChoice) {
            case "1":
                filters.locationType = 'local';
                break;
            case "2":
                filters.locationType = 'remote';
                break;
            case "3":
                const zipCode = await promptUser("Enter ZIP code: ");
                if (zipCode.trim()) {
                    filters.zipCode = zipCode.trim();
                }
                break;
        }
    }

    // Price filter
    const usePrice = await promptUser("Filter by price? (y/n): ");
    if (usePrice.toLowerCase() === 'y' || usePrice.toLowerCase() === 'yes') {
        const minPrice = await promptUser("Minimum price (0 for free items, Enter to skip): ");
        const maxPrice = await promptUser("Maximum price (Enter to skip): ");

        if (minPrice.trim()) {
            filters.minPrice = parseFloat(minPrice) || 0;
        }
        if (maxPrice.trim()) {
            filters.maxPrice = parseFloat(maxPrice);
        }
    }

    // Condition filter
    const useCondition = await promptUser("Filter by condition? (y/n): ");
    if (useCondition.toLowerCase() === 'y' || useCondition.toLowerCase() === 'yes') {
        console.log("1. New");
        console.log("2. Like New");
        console.log("3. Good");
        console.log("4. Fair");
        console.log("5. Poor");
        console.log("6. For Parts");

        const condChoice = await promptUser("Select condition: ");
        const conditions = ['New', 'Like New', 'Good', 'Fair', 'Poor', 'For Parts'];
        const condIndex = parseInt(condChoice) - 1;
        if (condIndex >= 0 && condIndex < conditions.length) {
            filters.condition = conditions[condIndex];
        }
    }

    try {
        const response = await sendAPIRequest('api_shopping_advanced_filter', filters);

        if (!response || response.status !== 'ok') {
            console.log("Error: Unable to apply advanced filters");
            await promptUser("\nPress Enter to continue...");
            return;
        }

        const listings = response.listings || [];
        await DisplayListings(listings, "Advanced Filtered Results");

    } catch (error) {
        console.log(`Error applying advanced filters: ${error.message}`);
        await promptUser("\nPress Enter to continue...");
    }
}



// Categories (main menu option)
async function BrowseByCategory() {
    console.log("\n=== Categories ===");

    const categories = Object.keys(SHOPPING_CATEGORIES);

    console.log("\nSelect a category to browse:");
    for (let i = 0; i < categories.length; i++) {
        console.log(`${i + 1}. ${categories[i]}`);
    }

    const choice = await promptUser(`\nSelect category (1-${categories.length}) or 'cancel': `);

    if (choice.toLowerCase() === 'cancel') {
        return;
    }

    const categoryIndex = parseInt(choice) - 1;
    if (categoryIndex < 0 || categoryIndex >= categories.length) {
        console.log("Invalid selection.");
        return;
    }

    const selectedCategory = categories[categoryIndex];

    try {
        const response = await sendAPIRequest('api_shopping_filter', {
            category: selectedCategory
        });

        if (!response || response.status !== 'ok') {
            console.log("Error: Unable to browse category");
            await promptUser("\nPress Enter to continue...");
            return;
        }

        const listings = response.listings || [];
        await DisplayListings(listings, selectedCategory);

    } catch (error) {
        console.log(`Error browsing category: ${error.message}`);
        await promptUser("\nPress Enter to continue...");
    }
}

// Browse local listings
async function BrowseLocalListings() {
    console.log("\n=== Local Listings ===");

    const zipCode = await promptUser("Enter your ZIP code to find nearby listings (or press Enter for all local): ");

    try {
        const filterData = { locationType: 'local' };
        if (zipCode.trim()) {
            filterData.zipCode = zipCode.trim();
        }

        const response = await sendAPIRequest('api_shopping_filter_location', filterData);

        if (!response || response.status !== 'ok') {
            console.log("Error: Unable to load local listings");
            await promptUser("\nPress Enter to continue...");
            return;
        }

        const listings = response.listings || [];
        const title = zipCode.trim() ? `Local Listings near ${zipCode.trim()}` : "All Local Listings";
        await DisplayListings(listings, title);

    } catch (error) {
        console.log(`Error loading local listings: ${error.message}`);
        await promptUser("\nPress Enter to continue...");
    }
}

// Post new listings with enhanced features
async function PostListings(wallet) {
    const listings = [];

    while (true) {

        // Get listing information
        const listing = await GetEnhancedListingFromUser();
        if (!listing) {
            break; // User cancelled
        }

        listings.push(listing);
        console.log("\n✅ Listing added to queue!");

        // Ask if they want to add another
        const addAnother = await promptUser("\nDo you want to add another listing? (y/n): ");
        if (addAnother.toLowerCase() !== 'y' && addAnother.toLowerCase() !== 'yes') {
            break;
        }
    }

    if (listings.length === 0) {
        console.log("No listings to submit.");
        return;
    }

    // Submit all listings
    console.log(`\nSubmitting ${listings.length} listing(s) to the network...`);

    let successCount = 0;
    for (const listing of listings) {
        try {
            const response = await sendAPIRequest('api_shopping_post_listing', {
                ...listing,
                walletAddress: wallet.address,
                version: 2
            });

            if (response && response.status === 'ok') {
                successCount++;
                console.log(`✓ "${listing.title}" posted successfully`);
            } else {
                console.log(`✗ Failed to post "${listing.title}": ${response?.message || 'Unknown error'}`);
            }

        } catch (error) {
            console.log(`✗ Failed to post "${listing.title}": ${error.message}`);
        }
    }
    
    console.log(`\n🎉 Summary: ${successCount}/${listings.length} listings posted successfully!`);

    // Show business folder info
    console.log("\n📁 Tip: You can accept TheeCoin payments on your website by using");
    console.log("   the files in the 'business' folder of this wallet directory.");
    console.log("   This includes a ready-to-use buy button with payment processing!");

    await promptUser("\nPress Enter to continue...");
}

// Listing creation with all new features
async function GetEnhancedListingFromUser() {
    const listing = {
        title: '',
        description: '',
        category: '',
        subcategory: '',
        price: '',
        condition: '',
        locationType: '',
        location: '',
        zipCode: '',
        images: [],
        imageDeleteUrls: [],
        tags: [],
        link: '',
        contact: '',
        version: 2
    };

    console.log("\n📝 Creating Listing");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Step 1: Basic Information
    console.log("\n📋 Step 1: Basic Information");

    listing.title = await promptUser("📝 Enter listing title (max 100 characters): ");
    if (!listing.title.trim() || listing.title.length > 100) {
        console.log("❌ Title is required and must be 100 characters or less.");
        return null;
    }
    listing.title = listing.title.trim();

    listing.description = await promptUser("📄 Enter description (max 500 characters): ");
    if (!listing.description.trim() || listing.description.length > 500) {
        console.log("❌ Description is required and must be 500 characters or less.");
        return null;
    }
    listing.description = listing.description.trim();

    // Step 2: Category Selection
    console.log("\n📂 Step 2: Category Selection");

    const categories = Object.keys(SHOPPING_CATEGORIES);
    console.log("\nAvailable Categories:");
    for (let i = 0; i < categories.length; i++) {
        console.log(`${i + 1}. ${categories[i]}`);
    }

    const categoryChoice = await promptUser(`\nSelect category (1-${categories.length}): `);
    const categoryIndex = parseInt(categoryChoice) - 1;

    if (categoryIndex < 0 || categoryIndex >= categories.length) {
        console.log("❌ Invalid category selection.");
        return null;
    }

    listing.category = categories[categoryIndex];

    // Subcategory selection
    const subcategories = SHOPPING_CATEGORIES[listing.category];
    console.log(`\nSubcategories for ${listing.category}:`);
    console.log("0. No specific subcategory");
    for (let i = 0; i < subcategories.length; i++) {
        console.log(`${i + 1}. ${subcategories[i]}`);
    }

    const subChoice = await promptUser(`\nSelect subcategory (0-${subcategories.length}): `);
    const subIndex = parseInt(subChoice);

    if (subIndex < 0 || subIndex > subcategories.length) {
        console.log("❌ Invalid subcategory selection.");
        return null;
    }

    if (subIndex > 0) {
        listing.subcategory = subcategories[subIndex - 1];
    }

    // Step 3: Price and Condition
    console.log("\n💰 Step 3: Price and Condition");

    listing.price = await promptUser("💰 Enter price (e.g., '$50', 'Free', 'Best Offer', max 50 chars): ");
    if (listing.price.length > 50) {
        console.log("❌ Price must be 50 characters or less.");
        return null;
    }
    listing.price = listing.price.trim();

    console.log("\nCondition options:");
    console.log("1. New");
    console.log("2. Like New");
    console.log("3. Good");
    console.log("4. Fair");
    console.log("5. Poor");
    console.log("6. For Parts");
    console.log("7. Not Applicable");

    const conditionChoice = await promptUser("Select condition (1-7): ");
    const conditions = ['New', 'Like New', 'Good', 'Fair', 'Poor', 'For Parts', 'Not Applicable'];
    const condIndex = parseInt(conditionChoice) - 1;

    if (condIndex >= 0 && condIndex < conditions.length) {
        listing.condition = conditions[condIndex];
    }

    // Step 4: Location Information
    console.log("\n🌍 Step 4: Location Information");

    console.log("\nLocation type:");
    console.log("1. Local (in-person pickup/delivery)");
    console.log("2. Remote (shipping/digital)");

    const locationChoice = await promptUser("Select location type (1-2): ");

    if (locationChoice === "1") {
        listing.locationType = 'local';

        listing.zipCode = await promptUser("📍 Enter your ZIP code: ");
        if (!listing.zipCode.trim()) {
            console.log("❌ ZIP code is required for local listings.");
            return null;
        }
        listing.zipCode = listing.zipCode.trim();

        listing.location = await promptUser("🏙️  Enter city/area (optional): ");
        listing.location = listing.location.trim();

    } else if (locationChoice === "2") {
        listing.locationType = 'remote';

        listing.location = await promptUser("🌐 Enter shipping info (e.g., 'Ships worldwide', optional): ");
        listing.location = listing.location.trim();

    } else {
        console.log("❌ Invalid location type selection.");
        return null;
    }

    // Step 5: Images
    console.log("\n🖼️  Step 5: Images (up to 10 images)");

    const addImages = await promptUser("Add images to your listing? (y/n): ");
    if (addImages.toLowerCase() === 'y' || addImages.toLowerCase() === 'yes') {
        await AddImagesToListing(listing);
    }

    // Step 6: Additional Information
    console.log("\n📋 Step 6: Additional Information");

    // Tags
    const tagsInput = await promptUser("🏷️  Enter search tags (comma-separated, optional): ");
    if (tagsInput.trim()) {
        listing.tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    }

    // Link
    listing.link = await promptUser("🔗 Enter store/product link (optional): ");
    if (listing.link.length > 300) {
        console.log("❌ Link must be 300 characters or less.");
        return null;
    }
    listing.link = listing.link.trim();

    // Contact
    listing.contact = await promptUser("📞 Enter contact information (optional): ");
    if (listing.contact.length > 200) {
        console.log("❌ Contact info must be 200 characters or less.");
        return null;
    }
    listing.contact = listing.contact.trim();

    // Final confirmation
    console.log("\n📋 Listing Summary:");
    console.log(`📝 Title: ${listing.title}`);
    console.log(`📂 Category: ${listing.category}${listing.subcategory ? ` > ${listing.subcategory}` : ''}`);
    console.log(`💰 Price: ${listing.price || 'Not specified'}`);
    console.log(`🔧 Condition: ${listing.condition || 'Not specified'}`);
    console.log(`🌍 Type: ${listing.locationType}`);
    if (listing.zipCode) console.log(`📍 ZIP: ${listing.zipCode}`);
    if (listing.location) console.log(`🏙️  Location: ${listing.location}`);
    console.log(`🖼️  Images: ${listing.images.length}`);
    if (listing.tags.length > 0) console.log(`🏷️  Tags: ${listing.tags.join(', ')}`);

    const confirm = await promptUser("\nConfirm and create this listing? (y/n): ");
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
        console.log("❌ Listing cancelled.");
        return null;
    }

    return listing;
}

// Add images to listing with imgbb integration
async function AddImagesToListing(listing) {
    console.log("\n🖼️  Image Upload Options:");
    console.log("You can add up to 10 images to your listing.");
    console.log("Images will be automatically deleted after 1 year when your listing expires.");

    while (listing.images.length < 10) {
        console.log(`\nCurrent images: ${listing.images.length}/10`);
        console.log("1. Upload image file from device");
        console.log("2. Enter image URL directly");
        console.log("3. Finish adding images");

        const choice = await promptUser("Choose option (1-3): ");

        switch (choice) {
            case "1":
                await UploadImageFile(listing);
                break;
            case "2":
                await AddImageURL(listing);
                break;
            case "3":
                return;
            default:
                console.log("❌ Invalid choice.");
        }

        if (listing.images.length >= 10) {
            console.log("✅ Maximum of 10 images reached.");
            break;
        }
    }
}

// Upload image file to imgbb
async function UploadImageFile(listing) {
    const filePath = await promptUser("📁 Enter full path to image file (jpg, png, gif): ");

    if (!filePath.trim()) {
        console.log("❌ File path cannot be empty.");
        return;
    }

    try {
        // Check if file exists
        if (!fs.existsSync(filePath.trim())) {
            console.log("❌ File not found. Please check the path and try again.");
            return;
        }

        // Read file and convert to base64
        const fileBuffer = fs.readFileSync(filePath.trim());
        const base64Data = fileBuffer.toString('base64');

        console.log("📤 Uploading image to imgbb...");

        // Upload to imgbb with 1 year expiration (31536000 seconds)
        const imageUrl = await uploadToImgbb(base64Data, 31536000);

        if (imageUrl) {
            listing.images.push(imageUrl.url);
            listing.imageDeleteUrls.push(imageUrl.deleteUrl);
            console.log(`✅ Image uploaded successfully: ${imageUrl.url}`);
        } else {
            console.log("❌ Failed to upload image.");
        }

    } catch (error) {
        console.log(`❌ Error uploading image: ${error.message}`);
    }
}

// Add image URL directly
async function AddImageURL(listing) {
    const imageUrl = await promptUser("🔗 Enter image URL (jpg, png, gif): ");

    if (!imageUrl.trim()) {
        console.log("❌ Image URL cannot be empty.");
        return;
    }

    // Basic URL validation
    const url = imageUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.log("❌ Please enter a valid URL starting with http:// or https://");
        return;
    }

    // Check if it's an image URL
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const hasImageExtension = imageExtensions.some(ext =>
        url.toLowerCase().includes(ext)
    );

    if (!hasImageExtension) {
        const confirm = await promptUser("⚠️  URL doesn't appear to be an image. Add anyway? (y/n): ");
        if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
            return;
        }
    }

    listing.images.push(url);
    console.log(`✅ Image URL added: ${url}`);
}

// Upload image to imgbb service
async function uploadToImgbb(base64Data, expiration = 31536000) {
    return new Promise((resolve, reject) => {
        const postData = `key=${IMGBB_API_KEY}&image=${encodeURIComponent(base64Data)}&expiration=${expiration}`;

        const options = {
            hostname: 'api.imgbb.com',
            port: 443,
            path: '/1/upload',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);

                    if (response.success) {
                        resolve({
                            url: response.data.url,
                            deleteUrl: response.data.delete_url
                        });
                    } else {
                        reject(new Error(response.error?.message || 'Upload failed'));
                    }
                } catch (error) {
                    reject(new Error('Invalid response from imgbb'));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

// Removed unused GetListingFromUser function

// Send shopping API request from web interface
export async function sendShoppingAPIRequest(type, data) {
    return sendAPIRequest(type, data);
}

// Send API request to node using proper hyperswarm request
async function sendAPIRequest(type, data) {
    try {
        if (!state.connectedToNetwork) {
            throw new Error('Not connected to TheeCoin network');
        }
        
        // Import the sendHyperswarmRequest function
        const { sendHyperswarmRequest } = await import('./client.js');
        
        // Send the request using the proper hyperswarm method
        const response = await sendHyperswarmRequest(type, {}, data);
        
        return response;
        
    } catch (error) {
        throw new Error(`Shopping API request failed: ${error.message}`);
    }
}

// View user's own listings
async function ViewMyListings(wallet) {
    console.log("\n=== My Listings ===");
    console.log("Loading your listings...");
    
    try {
        // Get all listings from the network
        const response = await sendAPIRequest('api_shopping_listings', {});
        
        if (!response || response.status !== 'ok') {
            console.log("Error: Unable to fetch listings from network");
            console.log("Please check your network connection and try again.");
            await promptUser("\nPress Enter to continue...");
            return;
        }
        
        const allListings = response.listings || [];
        
        // Filter to only show user's listings
        const myListings = allListings.filter(listing => 
            listing.walletAddress === wallet.address || listing.postedBy === wallet.address
        );
        
        if (myListings.length === 0) {
            console.log("\nYou haven't posted any listings yet.");
            console.log("Use 'Post Listing(s)' to create your first listing!");
            await promptUser("\nPress Enter to continue...");
            return;
        }
        
        // Display user's own listings (without "Posted by")
        await DisplayMyOwnListings(myListings, `My Listings (${myListings.length})`);

        // Manage listings menu
        await ManageMyListings(wallet, myListings);
        
    } catch (error) {
        console.log(`Error loading your listings: ${error.message}`);
        await promptUser("\nPress Enter to continue...");
    }
}

// Manage user's listings (edit/delete)
async function ManageMyListings(wallet, myListings) {
    while (true) {
        console.log("\n=== Manage My Listings ===");
        console.log("1. Edit a Listing");
        console.log("2. Delete a Listing");
        console.log("3. Back to Shopping Menu");
        console.log("4. Back to Main Menu");
        
        const choice = await promptUser("\nChoose an option: ");
        
        switch (choice) {
            case "1":
                await EditListing(wallet, myListings);
                return; // Go back to ViewMyListings to refresh
            case "2":
                await DeleteListing(wallet, myListings);
                return; // Go back to ViewMyListings to refresh
            case "3":
                return; // Go back to shopping menu
            case "4":
                return; // This will exit the shopping menu too
            default:
                console.log("Invalid choice. Please try again.");
        }
    }
}

// Edit a listing with enhanced fields
async function EditListing(wallet, myListings) {
    console.log("\n=== Edit Listing ===");

    if (myListings.length === 0) {
        console.log("No listings to edit.");
        return;
    }

    // Show listings to choose from
    for (let i = 0; i < myListings.length; i++) {
        console.log(`${i + 1}. ${myListings[i].title}`);
    }

    const choice = await promptUser(`\nSelect listing to edit (1-${myListings.length}) or 'cancel': `);

    if (choice.toLowerCase() === 'cancel') {
        return;
    }

    const listingIndex = parseInt(choice) - 1;
    if (listingIndex < 0 || listingIndex >= myListings.length) {
        console.log("Invalid selection.");
        return;
    }

    const listing = myListings[listingIndex];

    console.log(`\nEditing: ${listing.title}`);
    console.log("Leave field blank to keep current value, or enter 'change' to modify complex fields.");

    // Basic Information
    console.log("\n📋 Basic Information");
    const newTitle = await promptUser(`Title [${listing.title}]: `);
    const newDescription = await promptUser(`Description [${listing.description}]: `);

    // Category Selection
    console.log("\n📂 Category");
    const currentCategory = listing.category || 'none';
    const categoryChoice = await promptUser(`Category [${currentCategory}] (enter 'change' to select new): `);

    let newCategory = listing.category;
    let newSubcategory = listing.subcategory;

    if (categoryChoice.toLowerCase() === 'change') {
        const categories = Object.keys(SHOPPING_CATEGORIES);
        console.log("\nAvailable Categories:");
        for (let i = 0; i < categories.length; i++) {
            console.log(`${i + 1}. ${categories[i]}`);
        }

        const catChoice = await promptUser(`Select category (1-${categories.length}): `);
        const catIndex = parseInt(catChoice) - 1;

        if (catIndex >= 0 && catIndex < categories.length) {
            newCategory = categories[catIndex];

            // Subcategory selection
            const subcategories = SHOPPING_CATEGORIES[newCategory];
            console.log(`\nSubcategories for ${newCategory}:`);
            console.log("0. No specific subcategory");
            for (let i = 0; i < subcategories.length; i++) {
                console.log(`${i + 1}. ${subcategories[i]}`);
            }

            const subChoice = await promptUser(`Select subcategory (0-${subcategories.length}): `);
            const subIndex = parseInt(subChoice);

            if (subIndex > 0 && subIndex <= subcategories.length) {
                newSubcategory = subcategories[subIndex - 1];
            } else {
                newSubcategory = '';
            }
        }
    }

    // Price and Condition
    console.log("\n💰 Price & Condition");
    const newPrice = await promptUser(`Price [${listing.price || 'none'}]: `);

    const currentCondition = listing.condition || 'none';
    const conditionChoice = await promptUser(`Condition [${currentCondition}] (enter 'change' to select new): `);

    let newCondition = listing.condition;
    if (conditionChoice.toLowerCase() === 'change') {
        console.log("\nCondition options:");
        const conditions = ['New', 'Like New', 'Good', 'Fair', 'Poor', 'For Parts', 'Not Applicable'];
        for (let i = 0; i < conditions.length; i++) {
            console.log(`${i + 1}. ${conditions[i]}`);
        }

        const condChoice = await promptUser(`Select condition (1-${conditions.length}): `);
        const condIndex = parseInt(condChoice) - 1;

        if (condIndex >= 0 && condIndex < conditions.length) {
            newCondition = conditions[condIndex];
        }
    }

    // Location Information
    console.log("\n🌍 Location");
    const currentLocationType = listing.locationType || 'none';
    const locationTypeChoice = await promptUser(`Location Type [${currentLocationType}] (enter 'change' to select new): `);

    let newLocationType = listing.locationType;
    let newZipCode = listing.zipCode;
    let newLocation = listing.location;

    if (locationTypeChoice.toLowerCase() === 'change') {
        console.log("\nLocation type:");
        console.log("1. Local (in-person pickup/delivery)");
        console.log("2. Remote (shipping/digital)");

        const locChoice = await promptUser("Select location type (1-2): ");

        if (locChoice === "1") {
            newLocationType = 'local';
            newZipCode = await promptUser(`ZIP Code [${listing.zipCode || 'none'}]: `);
            if (!newZipCode.trim()) newZipCode = listing.zipCode;
        } else if (locChoice === "2") {
            newLocationType = 'remote';
            newZipCode = '';
        }
    }

    newLocation = await promptUser(`Location/Shipping Info [${listing.location || 'none'}]: `);

    // Images
    console.log("\n🖼️ Images");
    const currentImages = listing.images || [];
    console.log(`Current images: ${currentImages.length}`);
    if (currentImages.length > 0) {
        for (let i = 0; i < currentImages.length; i++) {
            console.log(`   ${i + 1}. ${currentImages[i]}`);
        }
    }

    const imageChoice = await promptUser("Keep current images? (y/n): ");
    let newImages = listing.images || [];
    let newImageDeleteUrls = listing.imageDeleteUrls || [];

    if (imageChoice.toLowerCase() === 'n' || imageChoice.toLowerCase() === 'no') {
        console.log("Note: Image editing in terminal is limited. Use web interface for full image management.");
        const addImageUrl = await promptUser("Add image URL (or press Enter to skip): ");
        if (addImageUrl.trim()) {
            newImages = [...(listing.images || []), addImageUrl.trim()];
        }
    }

    // Additional Information
    console.log("\n📋 Additional Information");
    const currentTags = listing.tags ? listing.tags.join(', ') : 'none';
    const newTagsInput = await promptUser(`Tags (comma-separated) [${currentTags}]: `);
    let newTags = listing.tags || [];
    if (newTagsInput.trim()) {
        newTags = newTagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    }

    const newLink = await promptUser(`Store/Product Link [${listing.link || 'none'}]: `);
    const newContact = await promptUser(`Contact [${listing.contact || 'none'}]: `);

    // Build updated listing
    const updatedListing = {
        id: listing.id,
        title: newTitle.trim() || listing.title,
        description: newDescription.trim() || listing.description,
        category: newCategory || listing.category,
        subcategory: newSubcategory || listing.subcategory || '',
        price: newPrice.trim() || listing.price || '',
        condition: newCondition || listing.condition || '',
        locationType: newLocationType || listing.locationType,
        location: newLocation.trim() || listing.location || '',
        zipCode: newZipCode?.trim() || listing.zipCode || '',
        images: newImages,
        imageDeleteUrls: newImageDeleteUrls,
        tags: newTags,
        link: newLink.trim() || listing.link || '',
        contact: newContact.trim() || listing.contact || '',
        walletAddress: wallet.address,
        timestamp: listing.timestamp, // Keep original timestamp
        postedBy: wallet.address,
        version: 2
    };

    try {
        const response = await sendAPIRequest('api_shopping_edit_listing', updatedListing);

        if (response && response.status === 'ok') {
            console.log("\n✅ Listing updated successfully!");
        } else {
            console.log("\n❌ Failed to update listing.");
            console.log(response?.message || "Unknown error occurred.");
        }
    } catch (error) {
        console.log(`\n❌ Error updating listing: ${error.message}`);
    }

    await promptUser("\nPress Enter to continue...");
}

// Delete a listing
async function DeleteListing(wallet, myListings) {
    console.log("\n=== Delete Listing ===");
    
    if (myListings.length === 0) {
        console.log("No listings to delete.");
        return;
    }
    
    // Show listings to choose from
    for (let i = 0; i < myListings.length; i++) {
        console.log(`${i + 1}. ${myListings[i].title}`);
    }
    
    const choice = await promptUser(`\nSelect listing to delete (1-${myListings.length}) or 'cancel': `);
    
    if (choice.toLowerCase() === 'cancel') {
        return;
    }
    
    const listingIndex = parseInt(choice) - 1;
    if (listingIndex < 0 || listingIndex >= myListings.length) {
        console.log("Invalid selection.");
        return;
    }
    
    const listing = myListings[listingIndex];
    
    console.log(`\nSelected: ${listing.title}`);
    const confirm = await promptUser("Are you sure you want to delete this listing? (yes/no): ");
    
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
        console.log("Deletion cancelled.");
        return;
    }
    
    try {
        const response = await sendAPIRequest('api_shopping_delete_listing', { 
            id: listing.id,
            walletAddress: wallet.address 
        });
        
        if (response && response.status === 'ok') {
            console.log("\n✅ Listing deleted successfully!");
        } else {
            console.log("\n❌ Failed to delete listing.");
            console.log(response?.message || "Unknown error occurred.");
        }
    } catch (error) {
        console.log(`\n❌ Error deleting listing: ${error.message}`);
    }
    
    await promptUser("\nPress Enter to continue...");
}
