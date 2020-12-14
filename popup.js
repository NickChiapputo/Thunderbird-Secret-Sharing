window.addEventListener( "load", async ( event ) =>
{
	// Load the scheme, number of parties, and threshold values stored in local storage.
	let scheme = ( await browser.storage.local.get( "scheme" ) ).scheme;
	let numParties = ( await browser.storage.local.get( "numParties" ) ).numParties;
	let threshold = ( await browser.storage.local.get( "threshold" ) ).threshold;
	let addressBook = ( await browser.storage.local.get( "addressBook" ) ).addressBook;


	// Verify that the scheme exists. 
	// If it doesn't, set it to Shamir Secret Sharing and store it in local storage.
	if( scheme === undefined )
	{
		console.log( "Undefined scheme. Setting to Shamir Secret Sharing." );
		scheme = "sss"
		await browser.storage.local.set( { scheme } );
	}


	// Verify that the number of parties exists. 
	// If it doesn't, set it to 3 and store it in local storage.
	if( numParties === undefined )
	{
		numParties = 3;
		console.log( "Undefined number of parties. Setting to " + numParties + "." );
		await browser.storage.local.set( { numParties } );
	}


	// Verify that the scheme exists. 
	// If it doesn't, set it to the majority of the number of parties and store it in local storage.
	if( threshold === undefined )
	{
		threshold = Math.floor( ( numParties + 1 ) / 2 );
		console.log( "Undefined threshold. Setting to " + threshold + "." );
		await browser.storage.local.set( { threshold } );
	}


	// Verify that the address book selection exists. 
	// If it doesn't, set it to the Personal Address Book since this is the only guaranteed address book to exist.
	if( addressBook === undefined )
	{
		// Get list of address books. Search for Personal Address Book and get its ID.
		let addressBooks = ( await browser.addressBooks.list( true ) );
		for( i = 0; i < addressBooks.length; i++ )
		{
			// If the current address book is the currently
			// selected address book, then select the option.
			if( addressBooks[ i ].name === "Personal Address Book" )
				addressBook = addressBooks[ i ].id;
		}

		console.log( "Undefined address book. Setting to '" + addressBook + "'." );
		await browser.storage.local.set( { addressBook } );
	}


	// Get references to the input elements on the popup page.
	schemeBtn = document.getElementById( "schemeBtn" );					// Get the scheme update button.
	schemeSelect = document.getElementById( "schemeSelect" );			// Get the scheme selection content.
	schemeParties = document.getElementById( "schemeParties" );			// Get the number of parties input field.
	schemeThreshold = document.getElementById( "schemeThreshold" );		// Get the threshold input field.
	reconstructBtn = document.getElementById( "reconstructBtn" );		// Get the reconstruction button.
	addressBookSelect = document.getElementById( "addressBookSelect" );	// Get the address book selection content.


	// Change the number of parties input field value to match the stored value.
	schemeParties.value = numParties;


	// Change the threshold input field value to match the stored value.
	schemeThreshold.value = threshold;


	// Set the select scheme option to the currently selected scheme.
	for( i = 0; i < schemeSelect.options.length; i++ )
	{
		if( schemeSelect.options[ i ].value === scheme )
		{
			schemeSelect.selectedIndex = i;
			break;
		}
	}


	// Add all possible address books to the select address book option.
	// Select the one that is currently selected.
	let addressBooks = ( await browser.addressBooks.list( true ) );
	let foundAddressBook = false;	// Keep track of whether we've found the selected one or not. It may have been deleted.
	for( i = 0; i < addressBooks.length; i++ )
	{
		let newOption = document.createElement( "option" );	// Create a new option element.
		newOption.text = addressBooks[ i ].name;			// Store the human-readable address book name as the text display.
		newOption.value = addressBooks[ i ].id;				// Store the ID in the value field.
		addressBookSelect.add( newOption );

		// If the current address book is the currently
		// selected address book, then select the option.
		if( addressBooks[ i ].id === addressBook )
		{
			foundAddressBook = true;
			addressBookSelect.selectedIndex = i;
		}
	}

	// If address book was not selected (it was probably deleted since the last udpate),
	// then we need to set the index and the address to the Personal Address Book.
	if( !foundAddressBook )
	{
		// Get list of address books. Search for Personal Address Book and get its ID.
		let addressBooks = ( await browser.addressBooks.list( true ) );
		for( i = 0; i < addressBooks.length; i++ )
		{
			// If the current address book is the currently
			// selected address book, then select the option.
			if( addressBooks[ i ].name === "Personal Address Book" )
				addressBook = addressBooks[ i ].id;
		}

		console.log( "Undefined address book. Setting to '" + addressBook + "'." );
		await browser.storage.local.set( { addressBook } );

		for( i = 0; i < addressBookSelect.length; i++ )
		{
			if( addressBookSelect.options[ i ].value === addressBook )
			{
				addressBookSelect.selectedIndex = i;
				break;
			}
		}
	}


	// Add an onclick listener to the scheme update button.
	// Call the updateSchemeSelection function with the value and the name of the new scheme.
	schemeBtn.addEventListener( "click", () =>
	{
		schemeBtn.style.backgroundColor = "green";
		updateSchemeSelection( 	schemeSelect.value, 	schemeParties.value, 
								schemeThreshold.value, 	addressBookSelect.value );
	} );


	// Add an onclick listener to the reconstruction button.
	// Open the message display window to show the last reconstructed message (or relevant error message).
	reconstructBtn.addEventListener( "click", () =>
	{
		createData = {};
		createData.url = "messageDisplay.html";
		browser.tabs.create( createData );
	} );


	// Add an onchange listener to the scheme selection content.
	// Revert the color of the update button to signifiy a change has been made.
	schemeSelect.addEventListener( "change", async () =>
	{
		// Get the current saved scheme. 
		let scheme = ( await browser.storage.local.get( "scheme" ) ).scheme;

		// If the newly selected value is different from the saved value, update the color of the button.
		if( schemeSelect.options[ schemeSelect.selectedIndex ].value !== scheme )
		{
			schemeBtn.style.transition = "background-color 500ms";
			schemeBtn.style.backgroundColor = "#3F51B5";
		}
	} );


	// Add an onchange listener to the scheme selection content.
	// Revert the color of the update button to signifiy a change has been made.
	addressBookSelect.addEventListener( "change", async () =>
	{
		// Get the current saved scheme. 
		let addressBook = ( await browser.storage.local.get( "addressBook" ) ).addressBook;

		// If the newly selected value is different from the saved value, update the color of the button.
		if( addressBookSelect.options[ addressBookSelect.selectedIndex ].value !== addressBook )
		{
			schemeBtn.style.transition = "background-color 500ms";
			schemeBtn.style.backgroundColor = "#3F51B5";
		}
	} );


	// Output the current scheme and parameters.
	console.log( "'" + scheme + "' currently selected. Number of parties: " + numParties + ". Threshold: " + threshold + ".\nPulling addresses from '" + addressBook + "'." );
} );


window.addEventListener( "unload", async ( event ) =>
{
	// console.log( "Unloading." );
} );


async function updateSchemeSelection( scheme, numParties, threshold, addressBook )
{
	// Verify that the number of parties and threshold are valid values.
	// If it is not, exit out of the function since it is invalid.
	if( numParties < threshold ||																				// Threshold should be less than or equal to number of parties.
		numParties === undefined || isNaN( numParties ) || numParties === '' ||	parseInt( numParties ) <= 0 ||	// Number of parties should be a number greater than zero.
		threshold === undefined || isNaN( threshold ) || threshold === '' || parseInt( threshold ) <= 0 )		// Threshold should be a number greater than zero.
	{
		console.log( "Invalid parameters. Threshold ('" + threshold + "') should be less than or equal to the number of parties ('" + numParties + "')." )
		return;
	}


	// Output the current scheme and parameters.
	console.log( "'" + scheme + "' currently selected. Number of parties: " + numParties + ". Threshold: " + threshold + ".\nPulling addresses from '" + addressBook + "'." );


	await browser.storage.local.set( { scheme } );			// Store the new scheme in local storage.
	await browser.storage.local.set( { numParties } );		// Store the new number of parties in local storage.
	await browser.storage.local.set( { threshold } );		// Store the new threshold in local storage.
	await browser.storage.local.set( { addressBook } );		// Store the new threshold in local storage.
}