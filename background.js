// Global Parameters
var idLength = 128;		// Length of subject line hex string ID in nibbles (half-bytes).
var testing = true;

window.addEventListener( 'load', async ( event ) => {
	console.log( "Secret sharing ready!" );


	// Load the scheme, number of parties, and threshold values stored in local storage.
	// We want to make sure that everything is set up before the user wants to use it.
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
		numParties = 4;
		console.log( "Undefined number of parties. Setting to " + numParties + "." );
		await browser.storage.local.set( { numParties } );
	}


	// Verify that the scheme exists. 
	// If it doesn't, set it to the majority of the number of parties and store it in local storage.
	if( threshold === undefined )
	{
		threshold = Math.floor( numParties / 2 ) + 1;
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


	// Output the current scheme and parameters.
	console.log( "'" + scheme + "' currently selected. Number of parties: " + numParties + ". Threshold: " + threshold + ".\nPulling addresses from '" + addressBook + "'." );
} );


/****
	*	Function to grab encoded message
	*
	* 	@param msg				The message to encode. Of type String.
	*
	*
	*	@return 				Encoded message of type ArrayBuffer.
	*
****/
function getMessageEncoding( msg )
{
	let enc = new TextEncoder();
	return enc.encode( msg );
}


/****
	*	Function to decode message
	*
	* 	@param msg				The message to decode. Of type ArrayBuffer.
	*
	*
	*	@return 				Decoded message of type String.
	*
****/
function getMessageDecoding( msg )
{
	let dec = new TextDecoder();
	return dec.decode( msg );
}


/****
	*	Convert Uint8Array to hex string.
	*
	* 	@param bytes			Uint8Array.
	*
	*	@return 				Converted string in hex.
****/
function bytesToHex( byteArray )
{
	return Array.prototype.map.call( byteArray, function( byte ) {	// Map function call to each byte in the byteArray
		return ( '0' + 												// Prepend a zero if byte value is F or below.
				( byte & 0xFF )										// Bitwise AND with FF to trim to one byte of data.
								.toString( 16 ) )					// Convert integer to string with radix 16 (hex).
								.slice( -2 ); 						// Take the last two characters representing one byte.
	} ).join( '' );													// Join each return string with no spaces in between.
}


/****
    *	Convert a hex string to a UTF-8 string.
    *
    *	@param hex 				A string in hex format.
    *
    * 	@return 				A string in UTF-8 format.
****/
function hexToString( hex )
{
	let result = "";

	// Convert every two characters of the hex string
	// into a character and append to the result.
	for( i = 0; i < hex.length; i += 2 )
	{
		// Parse the next two characters from hex to an integer.
		// Convert the integer as a character code into a string character.
		result += String.fromCharCode( parseInt( hex.substring( i, i + 2 ), 16 ) );
	}


	return result;
}


/****
	*	Convert a hex string to a binary string.
	*
	*	@param hex 				A string in hex format.
	*
	*	@return 				Padded length bit string.
****/
function hexToBinary( hex )
{
	let result = "";

	// Split by each hex character
	hex.split( "" ).forEach( str =>
	{
		// Parse the character into an integer.
		// Convert the integer into a binary string representation.
		// Pad with leading zeros for four bits (each hex character is a nibble).
		result += ( parseInt( str, 16 ).toString( 2 ) ).padStart( 4, '0' );
	} );

	return result;
}


/****
	*	Read raw message data and extract attachment information. Can parse multiple attachments from one raw message string.
	*
	*	@param data 			Raw message string.
	*
	*	@return 				Array containing array of string contents from attachments and array of attachment file titles. Attachment contents are in base64 format.
****/
function getAttachmentData( data )
{
	// Get list of raw attachments. First index is previous portion of raw message,
	// so length is one less than array length.
	let rawAttachments = data.split( "Content-Disposition: attachment;" );
	let numAttachments = rawAttachments.length - 1;

	// Create array to hold string contents and file titles.
	let contents = [];
	let titles = [];

	let rawAttachment;
	let i, j;

	for( i = 1; i <= numAttachments; i++ )
	{
		// Verify that an attachment exists. Break if it doesn't.
		if( rawAttachments[ i ] === undefined )
		{
			return -1;
		}


		// Get portion of raw message relating to the 'ith' 
		// attachment then get lines of raw attachment.
		let rawAttachmentLines = rawAttachments[ i ].split( "\n" );


		// The second line contains the filename in the format 'filename="<filename>"'.
		// Parse this out to get the filename.
		let filename = rawAttachmentLines[ 1 ].substring( 11, rawAttachmentLines[ 1 ].length - 2 );
		

		// Only add the file if it is a share, tag-x-x, or k-x-x.
		if( /(share|tag-[0-9]+-[0-9]+|k-[0-9]+-[0-9]+)/.exec( filename ) )
		{
			// Get Base64 content from raw message by looping through the attachment lines.
			// First three lines are blank line, filename, and blank line. So we must skip those
			// before parsing the rest of the text (i.e., start at j = 3).
			let content = "";
			for( j = 3; j <= rawAttachmentLines.length - 1; j++ )
			{
				// Boundary in raw message with attachment begins with fourteen hyphens.
				// If line begins with this, then stop parsing and break out of loop.
				if( rawAttachmentLines[ j ].startsWith( "--------------" ) ) break;


				// Add current line to content.
				content += rawAttachmentLines[ j ];
			}


			// Attachment area ends with an extra newline.
			// This needs to be removed before decryption.
			content = content.substring( 0, content.length - 1 );



			contents.push( content );	// Store the current content string.
			titles.push( filename );	// Store the current filename.
		}
	}

	return [ contents, titles ];
}


/****
	*	Return messages with the subject matching the argument subject.
	*	Only get incoming messages (i.e., filter out those from the sent folder types).
	*
	*	@param subject 			A string containing the subject line to match.
	*
	*	@return 				An array containing the incoming messages with matching subject lines.
****/
async function getIncomingMessagesBySubject( subject )
{
	let queryInfo = { 	subject: subject };
	let messageList = ( await browser.messages.query( queryInfo ) ).messages;

	let matchingMessages = [];

	for( let i = 0; i < messageList.length; i++ )
	{
		if( messageList[ i ].folder.type !== "sent" && messageList[ i ].folder.type !== "archives" )
		{
			matchingMessages.push( messageList[ i ] );
		}
	}

	return matchingMessages;
}


/****
	*	Find the list of contacts in the address book referred to by
	*	the address book ID value. If the address book is not found,
	*	assume it is deleted and change the selected address book
	*	to the Personal Address Book that is guaranteed to exist.
	*
	*	@param addressBookID 	The ID value of the user-selected address book as stored in local storage
	*
	*	@return 				An array containing the contacts in the selected address book or in the Personal Address Book if the selected address book is not found.
****/
async function getContactList( addressBookID )
{
	// Attempt to query the address book. If it can't be found, an error will be thrown and
	// caught. Then, just select the Personal Address Book as a fallback. Also save the
	// personal address book ID since this means the other one was deleted.
	let addressBook, contacts;
	let i, j, account, folder;
	try
	{
		contacts = ( await browser.addressBooks.get( addressBookID, true ) ).contacts;
	}
	catch( e )
	{
		// Get list of address books. Search for Personal Address Book and get its ID.
		let addressBooks = ( await browser.addressBooks.list( true ) );
		for( i = 0; i < addressBooks.length; i++ )
		{
			// If the current address book is the currently
			// selected address book, then select the option.
			if( addressBooks[ i ].name === "Personal Address Book" )
				addressBook = addressBooks[ i ];
		}

		console.log( "Unable to find address book. Setting to '" + addressBook.name + "'." );
		contacts = addressBook.contacts;
		addressBook = addressBook.id;

		browser.storage.local.set( { addressBook } );
	}


	// Return the list of contacts in the selected address book.
	return contacts;
}


let lastMessage = undefined;
browser.messageDisplay.onMessageDisplayed.addListener( async ( tab, message ) => {
	// Store the last message.
	// This allows the user to select when to reconstruct
	// instead of reconstructing automatically for every message
	// including those that are not secret shared.
	lastMessage = message;
} );
 
browser.messageDisplayAction.onClicked.addListener( async ( tab ) => {
	/****	Use these parameters and the for loop to test the average execution time
		*	for share generation. Make sure to comment out the reconstruction window
		*	first, or it'll open after reach reconstruction and slow the time down.
		*
		*	Section Definitions: 
		*		Section 1 - Get full message.
		*		Section 2 - Subject line
		*		Section 3 - Get matching messages.
		*		Section 4 - Parse attachment data.
		*		Section 5 - Parse body data.
		*		Section 6 - Reconstruction.
		*		Section 7 - Save attachments.
	****/
	let numIterations = 1;
	let numSections = 7;
	let timeSet = new Array( numIterations );
	let timeSum = 0;
	let sectionTimeSum = new Array( numSections );
	let tstart = new Array( numSections );
	let tend = new Array( numSections );

	let i, j, itr;

	for( i = 0; i < numSections; i++ )
		sectionTimeSum[ i ] = 0;

	console.log( "\nRunning " + numIterations + " iterations..." );
	for( itr = 0; itr < numIterations; itr++ )
	{
		t0 = performance.now();
		tstart[ 0 ] = t0;

		// Catch invalid last message. May be an issue if the
		// add-on was loaded while a message was open without
		// switching tabs.
		if( lastMessage === undefined )
		{
			console.error( "ERROR: " + "Unable to get message." );
			return;
		}

		// Get content of message. Object type is MessagePart.
		let messageContent = await browser.messages.getFull( lastMessage.id );
		tend[ 0 ] = performance.now();
		tstart[ 1 ] = tend[ 0 ];
		

		// Create subject query to search for. Some domains can 
		// add headers (e.g., "[EXT] " in Outlook, "Fwd: " in 
		// Gmail, and "Fw: " in ProtonMail). We want to filter 
		// these out since not every message will be e.g. from 
		// an external source or forwarded. Use a regex to match 
		// to 128 hex characters.
		const regex = new RegExp( "[0-9a-f]{" + idLength + "}" )
		let subject = ( regex.exec( messageContent.headers.subject[ 0 ] ) );


		// Catch invalid subject.
		if( subject === null )
		{
			console.error( "ERROR: " + "Invalid subject identifier." );
			return;
		}


		// Reduce the subject value from an array to a value (there will only be one value in the array).
		subject = subject[ 0 ];
		tend[ 1 ] = performance.now();
		tstart[ 2 ] = tend[ 1 ];



		// Get list of messages in the same folder that match the subject line in the current message.
		let messageList = await getIncomingMessagesBySubject( subject );
		tend[ 2 ] = performance.now();
		tstart[ 3 ] = tend[ 2 ];


		// Get the number of shares/messages found
		// and create an array to hold the content of each attachment.
		let numShares = messageList.length;
		let contents = [];
		let titles = [];


		// Loop through each discovered message and get the attachment information.
		let rawData;
		for( i = 0; i < numShares; i++ )
		{
			// Get attachment data as a string from the raw message content.
			rawData = getAttachmentData( await browser.messages.getRaw( messageList[ i ].id ) );


			// Catch no attachment error.
			if( rawData === -1 )
			{
				console.error( "ERROR: " + "No share attached to message." );
				return;
			}


			// Separate contents and titles from attachment data.
			contents.push( rawData[ 0 ] );
			titles.push( rawData[ 1 ] );
		}
		tend[ 3 ] = performance.now();
		tstart[ 4 ] = tend[ 3 ];


		// Parse the message body to get the scheme parameters.
		let bodyParts = ( messageContent.parts[ 0 ].parts[ 0 ].body ).split( "\n" );

		let scheme = undefined;
		for( i = 0; i < bodyParts.length && scheme === undefined; i++ )
			scheme = bodyParts[ i ].split( " secret sharing scheme." )[ 0 ].split( "the " )[ 1 ];

		let shareCount = parseInt( bodyParts[ i ].split( "Number of Shares: " )[ 1 ] )
		let threshold = parseInt( bodyParts[ i + 1 ].split( "Threshold: " )[ 1 ] );
		tend[ 4 ] = performance.now();
		tstart[ 5 ] = tend[ 4 ];



		// Create variable to store the reconstructed value in.
		let reconstruction = "";
		// t0 = performance.now();
		// Select the appropriate secret sharing scheme.
		if( scheme === "Shamir" )					// Shamir Secret Sharing
		{
			// console.log( "\n\nScheme: Shamir Secret Sharing\n\nShares: " + numShares );

			// Parse contents as individual shares.
			let shares = [];
			for( i = 0; i < numShares; i++ )
			{
				// Convert base64 values to ASCII.
				shares.push( window.atob( contents[ i ][ 0 ] ) );
			}

			reconstruction = await shamirDecryption( shares );
		}
		else if( scheme === "(2, 2) additive" )		// (2, 2) Additive Secret Sharing
		{
			// console.log( "\n\n(2, 2) Additive Secret Sharing Scheme\n\nShares: " + numShares );

			// Parse contents as individual shares. One is the ciphertext, the other is the key.
			let shares = [];
			for( i = 0; i < numShares; i++ )
			{
				// Convert base64 values to ASCII.
				shares.push( window.atob( contents[ i ][ 0 ] ) );
			}

			reconstruction = await additiveDecryption( shares );
		}
		else if( scheme === "robust" )				// Robust Secret Sharing
		{
			// console.log( "\n\nScheme: Robust Secret Sharing\n\nShares: " + numShares );


			// Reformat the contents using the titles so that 
			// the tags matrix is in the format tags[ i ][ j ] = tag_ij and
			// the keys matrix is in the format keys[ i ][ j ] = k_ij


			// Create array to hold each party's share.
			let shares = new Array( numShares );


			// Create tag and key arrays. This is under the assumption that
			// we have found a message from each participant.
			let keys = [];
			let tags = [];
			for( i = 0; i < numShares; i++ )
			{
				// Create row for keys and tags to be stored.
				// This needs to be done before the attachment parsing
				// since the attachments may not be in order.
				keys.push( new Array( numShares ) );
				tags.push( new Array( numShares ) );
			}


			// Store the number of key-tag pairs for each pair of parties.
			// This calculated when reading the key or tag attachments.
			let numKeys = 0;

			let currShare, party;
			for( i = 0; i < numShares; i++ )
			{
				// First attachment will always be the share (based on the implementation in RSSEncryption()).
				// Parse the content of the share.
				currShare = window.atob( contents[ i ][ 0 ] );


				// The index of the current party will be found in the remaining attachments.
				party = -1;


				// Iterate through the remaining attachments (key and tag values).
				let titleParts, source, dest, attachment, components;
				for( j = 1; j < contents[ i ].length; j++ )
				{
					// The titles are in the format <type>-i-j where <type> is either 'tag' or 'k'.
					// Split the title into the three parts for parsing.
					titleParts = titles[ i ][ j ].split( "-" );


					// Parse source and dest party (i and j in e.g. k_ij).
					source = parseInt( titleParts[ 1 ] );
					dest = parseInt( titleParts[ 2 ] );

					if( isNaN( source ) || isNaN( dest ) )
					{
						console.error( "ERROR: Invalid source ('" + titleParts[ 1 ] + "') or dest ('" + titleParts[ 2 ] + "')." );
						return;
					}


					// Store the party number
					party = source - 1;


					// Convert content from Base64 to ASCII string.
					attachment = window.atob( contents[ i ][ j ] );


					// Parse the string into its components.
					// Each value is delimited by a newline.
					// Use map to convert string components to numbers.
					components = attachment.split( "\n" ).map( x => +x );


					// Set the number of keys. This will be rewritten each time,
					// but that's okay because they should all be the same.
					numKeys = components.length;


					// Parse the title to see if it is a key or tag
					if( titleParts[ 0 ] === "k" )			// If key, then...
					{
						// Save the key.
						keys[ source - 1 ][ dest - 1 ] = components;

						// Log the key.
						// console.log( "k_{" + source + "," + dest + "}: " + keys[ source - 1 ][ dest - 1 ] );
					}
					else if( titleParts[ 0 ] === "tag" )	// Otherwise, if tag, then...
					{
						// Save the tag.
						tags[ source - 1 ][ dest - 1 ] = components;

						// Log the tag.
						// console.log( "tag_{" + source + "," + dest + "}: " + keys[ source - 1 ][ dest - 1 ] );
					}
					else 									// Otherwise...
					{
						console.error( "ERROR: Invalid type: '" + titleParts[ 0 ] + "'." );
						return;
					}
				}


				// Verify that the party number is correct.
				if( party === -1 )				// Verify that a number was found	
				{
					console.error( "ERROR: Party number not found." );
					reconstruction = "ERROR: Party number not found.";
					browser.storage.local.set( { reconstruction } );
					return;
				}
				else if( party >= numShares )	// If the party number is greater than the number of shares, then we know that we're missing a share.
				{
					console.error( "ERROR: Party missing. Current party number ('" + party + "') is greater than number of shares ('" + numShares + "')." );
					reconstruction = "ERROR: Party missing. Current party number ('" + party + "') is greater than number of shares ('" + numShares + "').";
					browser.storage.local.set( { reconstruction } );
					return;
				}


				// Store current share.
				shares[ party ] = currShare;
				// console.log( "Share " + party + ": " + shares[ party - 1 ] );
			}


			/* Logging statements for the key and tag matrices
			let tagStr = "[\n";
			let keyStr = "[\n";
			let shareStr = "[\n";
			for( let i = 0; i < numShares; i++ )
			{
				tagStr += "  [ [ ";
				keyStr += "  [ [ ";
				for( let j = 0; j < numShares; j++ )
				{
					tagStr += tags[ i ][ j ] + ( j == numShares - 1 ? " ] ]\n" : " ], [ " );
					keyStr += keys[ i ][ j ] + ( j == numShares - 1 ? " ] ]\n" : " ], [ " );
				}
				shareStr += "    " + shares[ i ] + ( i == numShares - 1 ? "\n" : ",\n" );
			}
			tagStr += "]\n";
			keyStr += "]\n";
			shareStr += "]\n";

			console.log( "Tags:\n" + tagStr + "\n\nKeys:\n" + keyStr + "\n\nShares:\n" + shareStr );
			*/

			// Compute reconstruction using VSS.
			// The first index is a binary array that
			// shows whether share i was accepted (1)
			// or not (0). The second index is the 
			// reconstructed secret message as a string.
			reconstruction = ( await RSSDecryption( shares, keys, tags, numKeys ) )[ 1 ];
		}
		else 										// Invalid scheme option.
		{
			console.error( "ERROR: Invalid scheme selection '" + scheme + "'." );
			reconstruction = "Invalid scheme selection.";
			browser.storage.local.set( { reconstruction } );
		}
		tend[ 5 ] = performance.now();
		tstart[ 6 ] = tend[ 5 ];
		// t1 = performance.now();

		// Output reconstruction.
		if( reconstruction == -1 )
		{
			console.log( "\n\nUnable to reconstruct.\n\n" );

			reconstruction = "Unable to reconstruct.";
			browser.storage.local.set( { reconstruction } );
		}
		else
		{	
			// Parse out the attachment information and return the e-mail content reconstruction.
			reconstruction = await parseSecretAttachmentInformation( reconstruction );
			

			// console.log( "\n\nReconstructed Message:\n'" + reconstruction + "'\n\n" );
		
			browser.storage.local.set( { reconstruction } );
		}
		tend[ 6 ] = performance.now();


		// Open up the reconstruction view.
		//let newTab = browser.tabs.create( { url: "messageDisplay.html" } );


		t1 = performance.now();

		timeSet[ itr ] = t1 - t0;
		timeSum += timeSet[ itr ];

		for( j = 0; j < numSections; j++ )
			sectionTimeSum[ j ] += tend[ j ] - tstart[ j ];

		// console.log( ( itr + 1 ) + ": " + timeSet[ itr ] );
	}

	// for( itr = 0; itr < numIterations; itr++ )
	// 	console.log( ( itr + 1 ) + ": " + timeSet[ itr ] );

	outputTimeLogs( timeSum, numIterations, sectionTimeSum, numSections );

	// console.log( "Total Time: " + ( timeSum / 1000 ) + " seconds\nAverage Time: " + ( timeSum / numIterations ) + " milliseconds" );

	// for( i = 0; i < numSections; i++ )
	// {
	// 	console.log( 	"Section " + ( i + 1 ) + " Average Time: " + ( sectionTimeSum[ i ] / numIterations ) + " milliseconds\n" + 
	// 					                  "          Percentage: " + ( 100 * ( sectionTimeSum[ i ] / timeSum ) ).toFixed( 2 ) + "%\n" );
	// }
} );


/****
	*	Add a listener for messages sent between this script and content scripts.
	*
	*	@param query			The query sent from the content script.
	*
	*	@return 				The response to the query.
****/
browser.runtime.onMessage.addListener( async ( query ) => {
	console.log( "" )
	if( query === "getDecryption" )
	{
		return decryption;
	}
	else
	{
		return "Bad Query.";
	}
} );


/****
	*	Add a listener for when the composeAction button is clicked. 
	* 	Encrypt the message and create new compose windows with the shares.
	*
	*	@param tab 				Object holding information on the current tab.
	*
	* 	@return 				None
****/
browser.composeAction.onClicked.addListener( async ( tab ) => {
	/****	Use these parameters and the for loop to test the average execution time
		*	for share generation. Make sure to comment out the reconstruction window
		*	first, or it'll open after reach reconstruction and slow the time down.
		*
		*	Section Definitions: 
		*		Section 1 - Get compose detail and subject generation.
		*		Section 2 - Attachment information and appending.
		*		Section 3 - Get content encoding.
		*		Section 4 - Get scheme information and contacts.
		*		Section 5 - Share generation.
	****/
	let numIterations = 1;
	let numSections = 5;
	let timeSet = new Array( numIterations );
	let timeSum = 0;
	let sectionTimeSum = new Array( numSections );
	let tstart = new Array( numSections );
	let tend = new Array( numSections );
	let t0 = 0, t1 = 0;
	let i, j, itr;

	console.log( "\nRunning " + numIterations + " iterations..." );

	for( i = 0; i < numSections; i++ )
		sectionTimeSum[ i ] = 0;

	for( itr = 0; itr < numIterations; itr++ )
	{
		t0 = performance.now();
		tstart[ 0 ] = t0;


		// Get the details of the message being composed in the current tab
		let composeDetails = await browser.compose.getComposeDetails( tab.id );


		// Add subject line to the original message.
		// Also add a null delimiter to keep attachment 
		// data and the e-mail contents separate.
		composeDetails.plainTextBody = "SUBJECT: " + composeDetails.subject + "\n\n" + composeDetails.plainTextBody + "\0";


		// Generate a 128 character random value for the subject line.
		composeDetails.subject = bytesToHex( window.crypto.getRandomValues( new Uint8Array( idLength / 2 ) ) );


		/* 
		 * System returns an error if both 'plainTextBody' and 'body' exist when calling
		 * browser.compose.beginNew(), so body must be deleted. Deleting body instead of 
		 * plainTextBody because body contains html tags that aren't needed or wanted in
		 * the end message. Also set plain text flag so body isn't automatically 
		 * recreated when creating new compose window
		*/
		composeDetails.isPlainText = true;
		delete composeDetails.body;
		tend[ 0 ] = performance.now();
		tstart[ 1 ] = tend[ 0 ];


		// If there is an attachment, combine it with the e-mail content. Otherwise only use the e-mail content.
		let content = "";
		let attachments = await browser.compose.listAttachments( tab.id );	// Get the list of attachments.


		let header = "count=" + attachments.length + "\n";

		if( attachments.length !== 0 )
		{
			let fileData = "";
			let file;

			for( i = 0; i < attachments.length; i++ )
			{
				// Get the ith file in the attachment list.
				file = await attachments[ i ].getFile();


				// Add the current file name and size to the header. Format: name,type,size
				header += file.name + "," + file.type + "," + file.size + "\n";


				// Append the file data from the current file.
				fileData += await file.text();
			}


			// Add the attachment information for parsing during reconstruction.
			composeDetails.plainTextBody = 	composeDetails.plainTextBody + 	// Add the e-mail content.
											fileData;						// Data from all attachments as text.
		}
		tend[ 1 ] = performance.now();
		tstart[ 2 ] = tend[ 1 ];


		// Prepend the attachment count to the secret to be shared
		// Then get the byte data (Uint8Array) of the content.
		// Includes attachment data as applicable.
		content = getMessageEncoding( header + composeDetails.plainTextBody );
		tend[ 2 ] = performance.now();
		tstart[ 3 ] = tend[ 2 ];


		// Get the locally stored scheme type.
		let scheme = ( await browser.storage.local.get( "scheme" ) ).scheme;


		// For the (2, 2) additive scheme. The locally stored parameters do not matter.
		// Set the number of shares and the threshold to 2. Otherwise, retrieve the 
		// settings from local storage.
		let numShares, threshold;
		if( scheme === "add" )
		{
			numShares = 2;
			threshold = 2;
		}
		else
		{
			numShares = parseInt( ( await browser.storage.local.get( "numParties" ) ).numParties );	// Total number of shares to create.
			threshold = parseInt( ( await browser.storage.local.get( "threshold" ) ).threshold );	// Number of shares needed to successfully reconstruct.
		}


		// Clear the contents of the text to keep it a secret. Replace it with the scheme description.
		let schemeText = ( scheme === "sss" ) ? "Shamir" : ( ( scheme === "add" ) ? "(2, 2) additive" : ( ( scheme === "rss" ) ? "robust" : "<invalid>" ) ); 
		composeDetails.plainTextBody = "This message is distributed using the " + schemeText + " secret sharing scheme.\n" + 
										"Number of Shares: " + numShares + "\n" + 
										"Threshold: " + threshold;


		// If an email address has been entered in the ''to:'' field,
		// search for the contact in the address book.
		let secretEmailAddresses = [];
		if( composeDetails.to[ 0 ] !== undefined )
		{
			// Get the name and email in the TO: field in the composed email. Use these to verify the contact details.
			let name = composeDetails.to[ 0 ].substring( 0, composeDetails.to[ 0 ].indexOf( " <" ) );
			let email = composeDetails.to[ 0 ].substring( composeDetails.to[ 0 ].indexOf( " <" ) + 2, composeDetails.to[ 0 ].length - 1 );

			// Get the list of contacts in the currently selected address book.
			let contacts = await getContactList( ( await browser.storage.local.get( "addressBook" ) ).addressBook );

			// Iterate through each contact to find the matching one.
			let contact = undefined;
			for( j = 0; j < contacts.length; j++ )
			{
				if( contacts[ j ].properties.DisplayName === name && contacts[ j ].properties.PrimaryEmail === email )
				{
					contact = contacts[ j ];
					break;
				}
			}

			// If the contact was found, create an array of 
			// email address to use in the secret shared
			// emails. Otherwise, create an empty array.
			if( contact !== undefined )
			{
				// Grab the secret sharing email address for the contact,
				// clean them up, and format them for display in the "to: " field.
				// Thunderbird likes the "Display Name <email@address>" format.
				secretEmailAddresses = contact.properties.Notes.split( "," );																// Split the list of comma-delimited email addresses.
				for( i = 0; i < secretEmailAddresses.length; i++ )
					secretEmailAddresses[ i ] = name + " <" + secretEmailAddresses[ i ].trim() + ">";
			}
		}
		

		tend[ 3 ] = performance.now();
		tstart[ 4 ] = tend[ 3 ];
		// t0 = performance.now();
		// Select the appropriate secret sharing scheme.
		if( scheme === "sss" )			// Shamir Secret Sharing
		{
			// console.log( "\n\nShamir Secret Sharing\n\n" );
			shamirEncryption( content, composeDetails, numShares, threshold, secretEmailAddresses );
		}
		else if( scheme === "add" )		// One-Time Pad
		{
			// console.log( "\n\n(2, 2) Additive Secret Sharing\n\n" );
			additiveEncryption( content, composeDetails, secretEmailAddresses );
		}
		else if( scheme === "rss" )		// Rabin BenOr Robus Secret Sharing
		{
			// console.log( "\n\nRobust Secret Sharing\n\n" );
			RSSEncryption( content, composeDetails, numShares, threshold, secretEmailAddresses );
		}
		else
		{
			console.error( "ERROR: Invalid scheme selection." );
		}


		/* 
			Close the current tab before the new one is opened.
			This is just so the user does not have to manually close
			it when they're done.
			
			Uncomment when not testing the system.
		*/
		// await browser.tabs.remove( tab.id );


		tend[ 4 ] = performance.now();
		t1 = tend[ 4 ];

		timeSet[ itr ] = t1 - t0;
		timeSum += timeSet[ itr ];

		for( j = 0; j < numSections; j++ )
			sectionTimeSum[ j ] += tend[ j ] - tstart[ j ];

		// console.log( ( itr + 1 ) + ": " + timeSet[ itr ] );
	}

	outputTimeLogs( timeSum, numIterations, sectionTimeSum, numSections );
} );


/****
	*	Function to abstract away printing the time results when testing the performance of the implementation.
	*
	*	@param timeSum 			The cumulative time in milliseconds.
	*
	*	@param numIterations 	The number of iterations simulated.
	*
	*	@param sectionTimeSum	The cumulative time in each section of the implementation in milliseconds.
	*
	*	@param numSections 		The number of unique sections.
	*
	*
	*	@return 				None.
****/
function outputTimeLogs( timeSum, numIterations, sectionTimeSum, numSections )
{

	// console.clear();
	let topDivider			=   " ┌────────────────────┬";
	let divider    			= "\n ├────────────────────┼";
	let sectionRow			=    "│       Section      │";
	let avgTimeRow			=    "│  Average Time (ms) │";
	let percentRow			=    "│     Percentage     │";
	let bottomDivider		= "\n ├────────────────────┼";
	let totalRow			=    "│   Total Time (ms)  │";
	let iterationsRow		=    "│     Iterations     │";
	let totalAverageRow		=    "│ Total Average (ms) │";
	let fullDivider			= "\n ├────────────────────┼";
	let emptyRow			=    "├────────────────────┼";
	let fullBottomDivider	= "\n └────────────────────┴";
	let padLength = 8;
	let decimals = 3;
	for( i = 0; i < numSections; i++ )
	{
		sectionRow 			+= " " + ( i + 1 ).toString().padStart( padLength, " " ) + " │";
		avgTimeRow 			+= " " + ( sectionTimeSum[ i ] / numIterations ).toString().padStart( padLength, " " ) + " │";
		percentRow 			+= " " + ( ( 100 * ( sectionTimeSum[ i ] / timeSum )  ).toFixed( decimals ) + "%" ).padStart( padLength, " " ) + " │";
		divider    			+= "".padStart( padLength + 2, "─" ) + ( ( i == numSections - 1 ) ? "┤" : "┼" );
		topDivider			+= "".padStart( padLength + 2, "─" ) + ( ( i == numSections - 1 ) ? "┐" : "┬" );
		fullDivider 		+= "".padStart( padLength + 2, "─" ) + ( ( i == numSections - 1 ) ? "┤" : "─" );
		bottomDivider		+= "".padStart( padLength + 2, "─" ) + ( ( i == numSections - 1 ) ? "┤" : "┴" );
		fullBottomDivider	+= "".padStart( padLength + 2, "─" ) + ( ( i == numSections - 1 ) ? "┘" : "─" );
		emptyRow 			+= "".padStart( padLength + 2, "─" ) + ( ( i == numSections - 1 ) ? "┤" : "─" );
		// console.log( 	"Section " + ( i + 1 ) + " Average Time: " + ( sectionTimeSum[ i ] / numIterations ) + " milliseconds\n" + 
		// 				                "            Percentage: " + ( 100 * ( sectionTimeSum[ i ] / timeSum ) ).toFixed( 2 ) + "%\n" );
	}

	divider    			+= "\n";
	topDivider 			+= "\n";
	fullDivider 		+= "\n";
	bottomDivider		+= "\n";
	fullBottomDivider	+= "\n";

	let temp = ( timeSum / 1000 ).toFixed( decimals ).toString() + " seconds";
	totalRow += new Array( 1 + Math.floor( ( ( numSections * ( padLength + 3 ) - 1 ) - temp.length ) / 2 ) ).join( " " ) +
				temp + 
				new Array( ( ( ( numSections * ( padLength + 3 ) - 1 ) - temp.length ) ) - Math.floor( ( ( numSections * ( padLength + 3 ) - 1 ) - temp.length ) / 2 ) ).join( " " ) + 
				" │";


	temp = ( numIterations ).toString();
	iterationsRow += 	new Array( 1 + Math.floor( ( ( numSections * ( padLength + 3 ) - 1 ) - temp.length ) / 2 ) ).join( " " ) +
						temp + 
						new Array( ( ( ( numSections * ( padLength + 3 ) - 1 ) - temp.length ) ) - Math.floor( ( ( numSections * ( padLength + 3 ) - 1 ) - temp.length ) / 2 ) ).join( " " ) + 
						" │";


	temp = ( timeSum / numIterations ).toFixed( decimals ).toString() + " milliseconds";
	totalAverageRow += 	new Array( 1 + Math.floor( ( ( numSections * ( padLength + 3 ) - 1 ) - temp.length ) / 2 ) ).join( " " ) +
						temp + 
						new Array( ( ( ( numSections * ( padLength + 3 ) - 1 ) - temp.length ) ) - Math.floor( ( ( numSections * ( padLength + 3 ) - 1 ) - temp.length ) / 2 ) ).join( " " ) + 
						" │";

	console.log( 	topDivider, 
					sectionRow, 		divider, 
					avgTimeRow, 		divider, 
					percentRow, 		bottomDivider,
					emptyRow, 			fullDivider, 
					totalRow, 			fullDivider, 
					iterationsRow, 		fullDivider, 
					totalAverageRow, 	fullBottomDivider );
}


/****
	*	Take in message information and create compose windows with attached shares
	*	using Rabin Ben-Or Secret Sharing.
	*
	*	@param content 			The subject/message content of the written e-mail as a Uint8Array value.
	*
	*	@param composeDetails 	The details of the current compose window.
	*
	*	@param numShares 		The number of shares to generate.
	*
	*	@param threshold 		The threshold for reconstruction.
	*
	*	@param addresses 		A list of addresses associated with the user-provided primary e-mail address. Will be used to populate the to: field in the new compose windows.
	*
	* 	@return 				None.
****/
async function RSSEncryption( content, composeDetails, numShares, threshold, addresses )
{
	/********** Shamir Shares **********/
	var secret = bytesToHex( content );								// Get hex string from secret message.
	// console.log( "Hex: '" + secret + "'" );							// Display the hex secret.
	var shares = secrets.share( secret, numShares, threshold );		// Create array of shares in hex strings.
	// console.log( shares );											// Display the shares.


	// Create array to hold attachment files for each share. 
	let len = shares.length;
	shareFiles = new Array( shares.length );

	// Binary MIME type used for each file.
	let mimeType = "application/octet-stream";	


	// Iterate through each share and create a binary file attachment
	// to add to each e-mail. Then, create a new compose window for each share.
	for( i = 0; i < len; i++ )
	{
		// Encoded array of Uint8 bytes for the current share.
		let byteArray = getMessageEncoding( shares[ i ] );

		// Create the file object to be attached 
		// to another compose window.
		shareFiles[ i ] = new File( [ byteArray ],			// Set content as the array of bytes corresponding to the current share.
									"share",				// Set the name of the file.
									{
										type: mimeType,		// Set the MIME type of the file.
									} );
	}

	/***********************************/
	/******** Universal Hashing ********/
	// Parameters
	let numKeys = 3;	// Number of keys and tags to generate for each pair of parties. 

	// Calculate tags from each party to each other party
	let keys = Array( numShares );							// Create index for key arrays for each party.
	let tags = Array( numShares );							// Create index for tag arrays for each party.
	let keyFiles = Array( numShares );						// Create index for key file arrays for each party.
	let tagFiles = Array( numShares );						// Create index for tag file arrays for each party.
	for( let i = 0; i < numShares; i++ )
	{
		keys[ i ] = Array( numShares );						// Create array of keys for each party
		tags[ i ] = Array( numShares );						// Create array of tags for each party.
		keyFiles[ i ] = Array( numShares );					// Create array of key files for each party.
		tagFiles[ i ] = Array( numShares );					// Create array of tag files for each party.
		

		// Create key from party i to party j.
		// Then compute the tags.
		for( let j = 0; j < numShares; j++ )
		{
			if( i != j )
			{
				let currKeySet = new Array( numKeys );		// Create array to hold each key.
				let keyString = "";							// Create a string to hold the keys with newline delimiters.

				// Create numKeys keys.
				for( let k = 0; k < numKeys; k++ )
				{
					// Since we now that the key is 32 bits long,
					// create an array of four bytes.
					let arr = new Uint8Array( 4 );

					// Generate four random bytes using the 
					// crypto library.
					window.crypto.getRandomValues( arr );

					// Set the first byte as most significant
					// and the last byte as the least significant
					// to create a 32-bit/4 byte number.
					currKeySet[ k ] = 	( ( arr[ 3 ] <<  0 ) >>> 0 ) + 	// Every bitwise operation needs to end in >>> 0
										( ( arr[ 2 ] <<  8 ) >>> 0 ) +	// in order to interpret the result as unsigned.
										( ( arr[ 1 ] << 16 ) >>> 0 ) +	// This just converts the value to unsigned.
										( ( arr[ 0 ] << 24 ) >>> 0 );

					// Convert the current key to a string and add it to the key string.
					// Don't add a newline at the last key. This allows us to not have to parse
					// it when reading the key file during decryption.
					keyString += currKeySet[ k ].toString() + ( k == numKeys - 1 ? "" : "\n" );
				}


				// Add the keyset to the k_ij key entry.
				keys[ i ][ j ] = currKeySet;


				// Create a file with the key string as the content.
				// Name it k-i-j.
				let byteArray = getMessageEncoding( keyString );
				let fileName = "k-" + ( i + 1 ) + "-" + ( j + 1 );
				keyFiles[ i ][ j ] = new File( 	[ byteArray ],		// Set content as the array of bytes corresponding to the current key k_ij.
												fileName,			// Set the name of the file.
												{
													type: mimeType,	// Set the MIME type of the file.
												} );

				// console.log( "Random Values: " + arr + " = " + 	( ( arr[ 3 ] <<  0 ) >>> 0 ) + " + " + 
				// 												( ( arr[ 2 ] <<  8 ) >>> 0 ) + " + " +
				// 												( ( arr[ 1 ] << 16 ) >>> 0 ) + " + " +
				// 												( ( arr[ 0 ] << 24 ) >>> 0 ) + " = " + keys[ i ][ j ] );

				// console.log( "k_{" + i + "," + j + "} = " + keys[ i ][ j ] + " = " + keyString + "\n" );
			}
		}
	}


	// let tagStr = "[\n";
	// let keyStr = "[\n";
	let s_i;											// Hold the 
	let currTagSet = new Array( numKeys );				// Create array to hold each tag.
	let tagString;										// Create a string to hold the tags with newline delimiters.
	let byteArray;										// Hold the byte conversion of the tag string.
	let filename;										// Hold the filename of the current tag file.
	for( let i = 0; i < numShares; i++ )
	{
		// tagStr += "  [ [ ";
		// keyStr += "  [ [ ";

		for( let j = 0; j < numShares; j++ )
		{
			if( i != j )
			{
				tagString = "";							

				// Create numKeys tags.
				for( let k = 0; k < numKeys; k++ )
				{
					/****
						* 	Compute tags using Krovetz-Rogaway (2001)
						* 	fast universal hashing over the Z_{32} field.
						* 	Since the Shamir shares are guaranteed to be
						* 	in multiples of 128, we don't need to pad them
						* 	to be in multiples of 32.
						* 	tag_ij = UHF( k_ji, s_i )
					****/
					currTagSet[ k ] = PolyQ32( keys[ j ][ i ][ k ], shares[ i ] );


					// Convert the current key to a string and add it to the key string.
					// Don't add a newline at the last key. This allows us to not have to parse
					// it when reading the key file during decryption.
					tagString += currTagSet[ k ].toString() + ( k == numKeys - 1 ? "" : "\n" );
				}

				tags[ i ][ j ] = currTagSet;


				// Create a file with the tag string as the content.
				// Name it tag-i-j.
				byteArray = getMessageEncoding( tagString );
				fileName = "tag-" + ( i + 1 ) + "-" + ( j + 1 );
				tagFiles[ i ][ j ] = new File( 	[ byteArray ],			// Set content as the array of bytes corresponding to the current key k_ij.
												fileName,				// Set the name of the file.
												{
													type: mimeType,		// Set the MIME type of the file.
												} );
			}

			// tagStr += ( tags[ i ][ j ] + ( j == numShares - 1 ? " ] ]\n" : " ], [ " ) );
			// keyStr += ( keys[ i ][ j ] + ( j == numShares - 1 ? " ] ]\n" : " ], [ " ) );
		}
	}
	// tagStr += "]\n";
	// keyStr += "]\n";


	// Log the tags and keys.
	// console.log( "Tags:\n" + tagStr + "\n\nKeys:\n" + keyStr );

	/***********************************/
	/***********************************/

	// Iterate through each party i and add 
	// the s_i, tag_ij, k_ij for all j in [numShares]\i.
	// Create new compose windows and add the attachments.
	for( let i = 0; i < numShares; i++ )
	{
		// Create a new compose window to add the current share to.
		// If we haven't used all of the addresses, set the current to: field.
		// Return object is a Tab object.
		if( i < addresses.length )
			composeDetails.to = addresses[ i ];
		let newTab = await browser.compose.beginNew( composeDetails );


		// Add the share as a binary file attachment.
		browser.compose.addAttachment( newTab.id, { file: shareFiles[ i ], name: "share" } );

		for( let j = 0; j < numShares; j++ )
		{
			if( i != j )
			{
				// Add key k_ij as a binary file attachment.
				browser.compose.addAttachment( newTab.id, { file: keyFiles[ i ][ j ], name: "k-" + ( i + 1 ) + "-" + ( j + 1 ) } );

				// Add tag tag_ij as a binary file attachment.
				browser.compose.addAttachment( newTab.id, { file: tagFiles[ i ][ j ], name: "tag-" + ( i + 1 ) + "-" + ( j + 1 ) } );
			}
		}
	}

}


/****
	*	Take in shamir shares, keys, and tags. Verify that shares are accurate, then use Shamir
	*	to decode the message.
	*	
	*	@param shares 			Array of shares in ASCII string format.
	*
	*	@param keys 			Matrix of keys in integer format. Ordered so keys[ i ][ j ] = k_ij.
	*
	*	@param tags 			Matrix of tags in integer format. Ordered so tags[ i ][ j ] = tag_ij;
	*
	*	@param numKeys			The number of keys and tags for each pair of parties. That is, there are numKeys key-tag pairs for k_ij and tag_ij.
	*
	*
	*	@return 				Array that contains list of each party and whether they are accepted or not (array contains {0, 1} for each party),
	* 							and reconstructed string of the message.
****/
async function RSSDecryption( shares, keys, tags, numKeys )
{
	// We can use this to check that shares can be not accepted with invalid tags.
	// Change the indices to affect different tags. Change the number of affected tags to make a share unacceptable.
	// Also change the number of partial tags to match numKeys.

	// Uncomment the following two lines to make share 0 not accepted.
	// tags[ 0 ][ 1 ] = [ 2, 2, 2 ];
	// tags[ 0 ][ 2 ] = [ 2, 2, 2 ];

	// Uncomment the following two lines t make share 1 not accepted.
	// tags[ 1 ][ 0 ] = [ 2, 2, 2 ];
	// tags[ 1 ][ 2 ] = [ 2, 2, 2 ];


	// We can use this to check that shares will not be accepted if they have changed.
	// Change the indices to affect different shares and ensure s_i != s_j. Otherwise it's not changing anything.
	// shares[ 2 ] = shares[ 1 ];


	// Get number of shares/parties.
	let numShares = shares.length;


	// Create array for shares that we want to accept.
	let acceptedShares = [];


	// Create binary array to represent party's whose shares are accepted (1s) and those whose shares are not accepted (0s).
	let acceptedList = [];


	// Iterate through the tags and keys and verify that they all match.
	let i, j, k, verificationTags, acceptedCount;
	for( i = 0; i < numShares; i++ )
	{
		acceptedCount = 0;
		for( j = 0; j < numShares; j++ )
		{
			// let t0 = performance.now();
			// We can't verify a party's own share!
			if( i != j )
			{
				// Iterate through each key-tag pair and check them all.
				verificationTags = [];
				for( k = 0; k < numKeys; k++ )
				{
					// Compute the verification tag using party i's share (s_i)
					// and the key from party j to party i (k_ji)
					verificationTags.push( PolyQ32( keys[ j ][ i ][ k ], shares[ i ] ) );


					// All of these key-tag pairs must match for it to be accepted.
					// This is how the security of the tags is increased.
					// If the current tag does not match, then break out of the loop early.
					if( verificationTags[ k ] != tags[ i ][ j ][ k ] )
						break;
				}

				// If all tags matched, then k is equal to numKeys. Otherwise, the tag is not acepted.
				if( k === numKeys )
				{
					acceptedCount++;
				}
				else
				{
					console.log( "Tags do not match ('" + verificationTags + "' !== '" + tags[ i ][ j ] + "')." );
				}
			}
		}


		// If a majority of the tags did not match, then don't accept the share and skip to the next iteration in the for loop.
		if( acceptedCount < ( ( numShares / 2 ) - 1 ) )
		{
			acceptedList.push( 0 );
			continue;
		}


		// Add the hex string share to the list. We don't need the binary string anymore
		// since the Shamir implementation uses hex strings.
		acceptedList.push( 1 );
		acceptedShares.push( shares[ i ] );
	}


	// We can use this to check that the reconstruction would fail if a bad share got through.
	// Change the indices to affect different shares and ensure s_i != s_j otherwise it's not changing anything.
	// Need to keep the first three characters as this is what identifies the shares in the SSS implementation. Otherwise it would parse out the duplicate.
	// The replace just replaces the first instance of an 'a' character with a '0' to corrupt the share. It is very likely there is at least one 'a' in the share.
	// acceptedShares[ 2 ] = acceptedShares[ 2 ].substring( 0, 3 ) + shares[ 1 ].substring( 3 );
	// acceptedShares[ 2 ] = acceptedShares[ 2 ].replace( "a", "0" );


	// We can just use the Shamir decryption function for regular SSS for the reconstruction.
	let reconstruction = await shamirDecryption( acceptedShares );

	return [ acceptedList, reconstruction ];
}


/****
	*	PolyQ32 universal hash for messages in Z_{32}
	*
	*	@param k 				Key is an integer element in Z_{32}.
	*	@param msg 				Message is a set of 32-bit blocks. String in hex form.
	*
	*	@return 				Hash of message. Integer in Z_{p(32)}.
****/
function PolyQ32( k, msg )
{
	let p = 2**32 - 5;						// Largest prime smaller than 2^32.
	let offset = 5; 						// For translating out-of-range words.
	let marker = 2**32 - 6;					// For marking out-of-range words.

	let n = Math.floor( msg.length / 32 );	// Get number of blocks in message. Each block is 32 bits/characters long.


	// Iterate through each block to calculate the hash.
	let y = 1;
	let m, i;
	for( i = 0; i < n; i++ )
	{
		// Get current message block and convert from hex string to integer. 
		// Start at index ( i * 32 ) and select the next 32 characters.
		m = parseInt( msg.substring( i * 32, ( i + 1 ) * 32 ), 16 );	


		if( m >= p - 1 )						// If word is not in range, then...
		{
			y = ( k * y + marker ) % p;			// Marker indicates out-of-range.
			y = ( k * y + ( m - offset ) ) % p;	// Offset m back into range.
		}
		else
		{
			y = ( k * y + m ) % p;				// Otherwise hash in-range word.
		}
	}

	return y;
}


/****
	*	Take in message information and create compose windows with attached shares
	*	using Shamir's Secret Sharing.
	*
	*	@param content 			The subject/message content of the written e-mail as a Uint8Array value.
	*
	*	@param composeDetails 	The details of the current compose window.
	*
	*	@param numShares 		The number of shares to generate.
	*
	*	@param threshold 		The threshold for reconstruction.
	*
	*	@param addresses 		A list of addresses associated with the user-provided primary e-mail address. Will be used to populate the to: field in the new compose windows.
	*
	* 	@return 				None.
****/
async function shamirEncryption( content, composeDetails, numShares, threshold, addresses )
{
	// Parameters
	var secret = bytesToHex( content );								// Get hex string from secret message.
	// console.log( "Hex: '" + secret + "'" );							// Display the hex secret.
	var shares = secrets.share( secret, numShares, threshold );		// Create array of shares in hex strings.
	// console.log( shares );											// Display the shares.


	// Create array to hold attachment files for each share. 
	let len = shares.length;
	shareFiles = new Array( shares.length );

	// Binary MIME type used for each file.
	let mimeType = "application/octet-stream";	

	// Iterate through each share and create a binary file attachment
	// to add to each e-mail. Then, create a new compose window for each share.
	let byteArray;
	for( let i = 0; i < len; i++ )
	{
		// Encoded array of Uint8 bytes for the current share.
		byteArray = getMessageEncoding( shares[ i ] );

		// Create the file object to be attached 
		// to another compose window.
		let shareFile = new File( [ byteArray ],			// Set content as the array of bytes corresponding to the current share.
									"share",				// Set the name of the file.
									{
										type: mimeType,		// Set the MIME type of the file.
									} );

		// Create a new compose window to add the current share to.
		// If we haven't used all of the addresses, set the current to: field.
		// Return object is a Tab object.
		if( i < addresses.length )
			composeDetails.to = addresses[ i ];
		let newTab = await browser.compose.beginNew( composeDetails );


		// Add the share as a binary file attachment.
		browser.compose.addAttachment( newTab.id, { file: shareFile, name: "share" } );
	}

}


/****
	*	Take in Shamir shares from raw attachments and decode the original message.
	*
	*	@param shares 			The shares in ASCII string format.
	*
	* 	@return 				The decoded message.
****/
async function shamirDecryption( shares )
{
	// Combine shares and perform reconstruction.
	// Returns a hex string.
	let hexReconstruction = secrets.combine( shares );


	// Convert from hex string to UTF-8 and return the
	// secret string including the attachment information.
	return hexToString( hexReconstruction );
}


/****
	*	Take in message information and create compose windows with attached shares
	* 	using One-Time Pad.
	*
	*	@param content 			The subject/message content of the written e-mail as a Uint8Array value.
	*
	*	@param composeDetails 	The details of the current compose window.
	*
	*	@param addresses 		A list of addresses associated with the user-provided primary e-mail address. Will be used to populate the to: field in the new compose windows.
	*
	* 	@return 				None.
****/
async function additiveEncryption( content, composeDetails, addresses )
{
	/*
		The getRandomValues() function will return a DOMException QuotaExceededError
		if we attempt to generate more than 65,536 bytes at one time. This comes into
		play if someone writes an essay, or they attach one or more large attachments.

		To fix this, we create the array of the length we want, and then generate values
		in chunks of 65,536. The final chunk is just the remainder which can be calculated
		using the modulo operation. 

		We use the set() method of the TypedArray object to set the chunks of the
		Uint8Array to the output from getRandomValues. The first argument is an ArrayBuffer
		or TypedArray (used here) and the second argument is the index at which to start.
	*/
	// Create the array of the appropriate length;
	let otpKey = new Uint8Array( content.length );	


	// Iterate through the number of parts needed.
	// Calculated as the integer part of ( content.length / 65536 ).
	// For example, 100,000 length would produce 1.5259. We want one 
	// chunk of 65,536 values and then a partial chunk of 
	// 65,536 * 0.5259 = 34,464 values.
	// Also have to save the iterator value in scope to be used in 
	// setting the partial chunk starting index.
	let i;
	for( i = 0; i < Math.trunc( content.length / 65536 ); i++ )
		otpKey.set( window.crypto.getRandomValues( new Uint8Array( 65536 ) ), i * 65536 );
	otpKey.set( window.crypto.getRandomValues( new Uint8Array( content.length % 65536 ) ), i * 65536 );


	// let str = "          ENCRYPTION\n   Message: ";		// Start output message to be displayed all at once.
	let cipherUint = new Uint8Array( content.length );	// Craete Uint8Array to hold the cipher text bytes.
	// let temp;


	// Encrypt message
	// let ciphertext = "";
	for( i = 0; i < content.length; i++ )
	{
		cipherUint[ i ] = content[ i ] ^ otpKey[ i ];		// XOR two Uint8 values
		// temp = cipherUint[ i ].toString();					// Convert character to string.
		// ciphertext += temp.padStart( 4, " " );				// Add byte value to ciphertext string.
	}


	/* Logging Statements
	// Get message character codes
	for( i = 0; i < content.length; i++ )
	{
		temp = content[ i ] + " ";
		str += temp.padStart( 4, " ");
	}

	str += "\n       Key: ";
	for( i = 0; i < content.length; i++ )
	{
		temp = otpKey[ i ] + " ";
		str += temp.padStart( 4, " ");
	}

	str += "\nCiphertext: " + ciphertext + "\n";
	console.log( str );
	*/


	// Create a binary file containing the encrypted contents
	let mimeType = "application/octet-stream";								// Binary MIME type for the file
	let encryptedMessageFile = new File( 	[ cipherUint ], 				// File object
											"share", 
											{ 	
												type: mimeType, 
												lastModified: Date.now() 
											} 
										);	

	// Create a binary file containing the key
	let keyFile = 	new File(	[ otpKey ],
								"share",
								{
									type: mimeType,
									lastModified: Date.now()
								}
							);

	// Create a new compose window to add the encrypted message to.
	composeDetails.to = addresses.length ? [ addresses[ 0 ] ] : []
	let encryptedMessageTab = await browser.compose.beginNew( composeDetails );

	// Add the encrypted message as a binary file attachment.
	browser.compose.addAttachment( encryptedMessageTab.id, { file: encryptedMessageFile, name: "share" } );


	// Crete a new compose window to add the key to.
	composeDetails.to = addresses.length > 1 ? [ addresses[ 1 ] ] : []
	let keyMessageTab = await browser.compose.beginNew( composeDetails );

	// Add the key as a binary file attachment.
	browser.compose.addAttachment( keyMessageTab.id, { file: keyFile, name: "share" } );

}


/****
	*	Take in One-Time Pad shares from raw attachments and decode the original message.
	*
	*	@param shares 			The shares in ASCII string format.
	*
	* 	@return 				The decoded message.
****/
async function additiveDecryption( shares )
{
	// There should only be two messages with the same subject line.
	// If there are more, only take the two most recent messages.
	if( shares.length != 2 )
	{
		if( shares.length <= 1 )
		{
			console.error( "ERROR: " + "There are no other messages with matching subject. Can not decrypt." );
			return "ERROR: There are no other messages with matching subject. Can not decrypt."
		}
		else
		{
			console.error( "ERROR: " + "There are " + shares.length + " messages with matching subjects, but only two are accepted. Can not decrypt." );
			return "ERROR: There are " + shares.length + " messages with matching subjects, but only two are accepted. Can not decrypt."
		}
	}


	// The length of either share is the length of the message.
	// Simply take the length of the first.
	let length = shares[ 0 ].length;

	// Create Uint8Array to hold decrypted Uint8 values.
	let decryptedUint = new Uint8Array( length );
	let i;
	for( i = 0; i < length; i++ )
	{
		decryptedUint[ i ] = shares[ 0 ].charCodeAt( i ) ^ shares[ 1 ].charCodeAt( i );
	}


	// Return the the secret string including the attachment information.
	return getMessageDecoding( decryptedUint );
}


/****
	*
	*
	*
****/
async function parseSecretAttachmentInformation( textContent )
{
	// Get the attachment count.
	let numAttachments = parseInt( textContent.substring( 6, textContent.indexOf( "\n" ) ) );

	// Remove the first line
	textContent = textContent.substring( textContent.indexOf( "\n" ) + 1 );


	// Store the information for each file in an array of objects.
	let fileInformation = new Array( numAttachments );
	let newLineIndex, parts;
	for( let i = 0; i < numAttachments; i++ )
	{
		// Get the index of the next newline (end of the current line).
		newLineIndex = textContent.indexOf( "\n" );


		// Get the current line and split it into parts at the comma delimiters.
		parts = ( textContent.substring( 0, newLineIndex ) ).split( ',' );


		// Parse the name, MIME type, and size of the attachment files.
		fileInformation[ i ] = {
			name: parts[ 0 ],
			type: parts[ 1 ],
			size: parseInt( parts[ 2 ] )
		};


		// Remove the first line
		textContent = textContent.substring( newLineIndex + 1 );
	}


	// Get the length of the secret by finding the index of the null character delimiter.
	// Then get the actual secret content
	let reconstructionLength = textContent.indexOf( "\0" );
	let reconstruction = textContent.substring( 0, reconstructionLength );


	// Iterate through each attachment and create the files.
	let reconstructedFileList = new Array( numAttachments );	// Array to store each file object.
	let startPos = reconstructionLength + 1;					// Starting index position to grab the content for the current file.
	let attachmentContent;
	for( let i = 0; i < numAttachments; i++ )
	{
		// Get the content for the attachment and convert the string to a Uint8Array.
		attachmentContent = getMessageEncoding( textContent.substring( startPos, startPos + fileInformation[ i ].size ) );


		// Create the file object for the current data and add it to the array.
		reconstructedFileList[ i ] = new File( 	[ attachmentContent ],					// Set content as the data in an array of bytes.
									fileInformation[ i ].name,				// Set the name of the file.
									{
										type: fileInformation[ i ].type,	// Set the MIME type of the file.
									} );


		// Update the next starting position.
		startPos += fileInformation[ i ].size;
	}


	// Store the file in local storage for the user to save later.
	await browser.storage.local.set( { reconstructedFileList } );

	return reconstruction;
}


;(function(root, factory) {
	"use strict"

	if (typeof define === "function" && define.amd) {
		// AMD. Register as an anonymous module.
		define([], function() {
			/*eslint-disable no-return-assign */
			return (root.secrets = factory())
			/*eslint-enable no-return-assign */
		})
	} else if (typeof exports === "object") {
		// Node. Does not work with strict CommonJS, but
		// only CommonJS-like environments that support module.exports,
		// like Node.
		module.exports = factory(require("crypto"))
	} else {
		// Browser globals (root is window)
		root.secrets = factory(root.crypto)
	}
})(this, function(crypto) {
	"use strict"

	var defaults, config, preGenPadding, runCSPRNGTest, CSPRNGTypes

	function reset() {
		defaults = {
			bits: 8, // default number of bits
			radix: 16, // work with HEX by default
			minBits: 3,
			maxBits: 20, // this permits 1,048,575 shares, though going this high is NOT recommended in JS!
			bytesPerChar: 1,
			maxBytesPerChar: 6, // Math.pow(256,7) > Math.pow(2,53)

			// Primitive polynomials (in decimal form) for Galois Fields GF(2^n), for 2 <= n <= 30
			// The index of each term in the array corresponds to the n for that polynomial
			// i.e. to get the polynomial for n=16, use primitivePolynomials[16]
			primitivePolynomials: [
				null,
				null,
				1,
				3,
				3,
				5,
				3,
				3,
				29,
				17,
				9,
				5,
				83,
				27,
				43,
				3,
				45,
				9,
				39,
				39,
				9,
				5,
				3,
				33,
				27,
				9,
				71,
				39,
				9,
				5,
				83
			]
		}
		config = {}
		preGenPadding = new Array(1024).join("0") // Pre-generate a string of 1024 0's for use by padLeft().
		runCSPRNGTest = true

		// WARNING : Never use 'testRandom' except for testing.
		CSPRNGTypes = [
			"nodeCryptoRandomBytes",
			"browserCryptoGetRandomValues",
			"testRandom"
		]
	}

	function isSetRNG() {
		if (config && config.rng && typeof config.rng === "function") {
			return true
		}

		return false
	}

	// Pads a string `str` with zeros on the left so that its length is a multiple of `bits`.
	function padLeft(str, multipleOfBits) {
		return str.padStart( Math.ceil( str.length / ( multipleOfBits || config.bits ) ) * ( multipleOfBits || config.bits ), '0' )

		var missing

		// If length to pad is 0 or 1, return the original string.
		if (multipleOfBits === 0 || multipleOfBits === 1) {
			return str
		}

		// If the pad length is too large, throw error.
		if (multipleOfBits && multipleOfBits > 1024) {
			throw new Error(
				"Padding must be multiples of no larger than 1024 bits."
			)
		}

		// Sets multipleOfBits to config.bits if multipleOfBits was not passed to the function.
		multipleOfBits = multipleOfBits || config.bits

		// Compute the number of missing characters.
		if (str) {
			missing = str.length % multipleOfBits
		}

		// If any characters are missing, combine an array of 1024 zeros
		// with the string and then slice the desired length from the end
		// of the resulting string.
		if (missing) {
			return (preGenPadding + str).slice(
				-(multipleOfBits - missing + str.length)
			)
		}

		return str
	}

	// Convert the given hex string to a binary representation string.
	function hex2bin(str) {
		var bin = "",
			num,
			i

		// Iterate over the string in reverse order.
		for (i = str.length - 1; i >= 0; i--) {
			// Convert the current character to a hex number.
			num = parseInt(str[i], 16)

			// If the value is an invalid number, throw error.
			if (isNaN(num)) {
				throw new Error("Invalid hex character.")
			}

			// Convert the number to binary and to make it four bits long.
			// Then, add the new string to the front of the binary representation.
			bin = padLeft(num.toString(2), 4) + bin 		
		}

		return bin
	}

	function bin2hex(str) {
		let hex = "",
			num,
			i;

		str = padLeft(str, 4);


		for (i = str.length; i >= 4; i -= 4) {
			hex = parseInt(str.slice(i - 4, i), 2).toString( 16 ) + hex;
			// if (isNaN(num)) {
			// 	throw new Error("Invalid binary character.")
			// }
			// hex = num.toString(16) + hex
		}

		return hex;
	}

	// Browser supports crypto.getRandomValues()
	function hasCryptoGetRandomValues() {
		if (
			crypto &&
			typeof crypto === "object" &&
			(typeof crypto.getRandomValues === "function" ||
				typeof crypto.getRandomValues === "object") &&
			(typeof Uint32Array === "function" ||
				typeof Uint32Array === "object")
		) {
			return true
		}

		return false
	}

	// Node.js support for crypto.randomBytes()
	function hasCryptoRandomBytes() {
		if (
			typeof crypto === "object" &&
			typeof crypto.randomBytes === "function"
		) {
			return true
		}

		return false
	}

	// Returns a pseudo-random number generator of the form function(bits){}
	// which should output a random string of 1's and 0's of length `bits`.
	// `type` (Optional) : A string representing the CSPRNG that you want to
	// force to be loaded, overriding feature detection. Can be one of:
	//    "nodeCryptoRandomBytes"
	//    "browserCryptoGetRandomValues"
	//
	function getRNG(type) {
		function construct(bits, arr, radix, size) {
			var i = 0,
				len,
				str = "",
				parsedInt

			if (arr) {
				len = arr.length - 1
			}

			while (i < len || str.length < bits) {
				// convert any negative nums to positive with Math.abs()
				parsedInt = Math.abs(parseInt(arr[i], radix))
				str = str + padLeft(parsedInt.toString(2), size)
				i++
			}

			str = str.substr(-bits)

			// return null so this result can be re-processed if the result is all 0's.
			if ((str.match(/0/g) || []).length === str.length) {
				return null
			}

			return str
		}

		// Node.js : crypto.randomBytes()
		// Note : Node.js and crypto.randomBytes() uses the OpenSSL RAND_bytes() function for its CSPRNG.
		//        Node.js will need to have been compiled with OpenSSL for this to work.
		// See : https://github.com/joyent/node/blob/d8baf8a2a4481940bfed0196308ae6189ca18eee/src/node_crypto.cc#L4696
		// See : https://www.openssl.org/docs/crypto/rand.html
		function nodeCryptoRandomBytes(bits) {
			var buf,
				bytes,
				radix,
				size,
				str = null

			radix = 16
			size = 4
			bytes = Math.ceil(bits / 8)

			while (str === null) {
				buf = crypto.randomBytes(bytes)
				str = construct(bits, buf.toString("hex"), radix, size)
			}

			return str
		}

		// Browser : crypto.getRandomValues()
		// See : https://dvcs.w3.org/hg/webcrypto-api/raw-file/tip/spec/Overview.html#dfn-Crypto
		// See : https://developer.mozilla.org/en-US/docs/Web/API/RandomSource/getRandomValues
		// Supported Browsers : http://caniuse.com/#search=crypto.getRandomValues
		function browserCryptoGetRandomValues(bits) {
			var elems,
				radix,
				size,
				str = null

			radix = 10
			size = 32
			elems = Math.ceil(bits / 32)
			while (str === null) {
				str = construct(
					bits,
					crypto.getRandomValues(new Uint32Array(elems)),
					radix,
					size
				)
			}

			return str
		}

		// /////////////////////////////////////////////////////////////
		// WARNING : DO NOT USE. For testing purposes only.
		// /////////////////////////////////////////////////////////////
		// This function will return repeatable non-random test bits. Can be used
		// for testing only. Node.js does not return proper random bytes
		// when run within a PhantomJS container.
		function testRandom(bits) {
			var arr,
				elems,
				int,
				radix,
				size,
				str = null

			radix = 10
			size = 32
			elems = Math.ceil(bits / 32)
			int = 123456789
			arr = new Uint32Array(elems)

			// Fill every element of the Uint32Array with the same int.
			for (var i = 0; i < arr.length; i++) {
				arr[i] = int
			}

			while (str === null) {
				str = construct(bits, arr, radix, size)
			}

			return str
		}

		// Return a random generator function for browsers that support
		// crypto.getRandomValues() or Node.js compiled with OpenSSL support.
		// WARNING : NEVER use testRandom outside of a testing context. Totally non-random!
		if (type && type === "testRandom") {
			config.typeCSPRNG = type
			return testRandom
		} else if (type && type === "nodeCryptoRandomBytes") {
			config.typeCSPRNG = type
			return nodeCryptoRandomBytes
		} else if (type && type === "browserCryptoGetRandomValues") {
			config.typeCSPRNG = type
			return browserCryptoGetRandomValues
		} else if (hasCryptoRandomBytes()) {
			config.typeCSPRNG = "nodeCryptoRandomBytes"
			return nodeCryptoRandomBytes
		} else if (hasCryptoGetRandomValues()) {
			config.typeCSPRNG = "browserCryptoGetRandomValues"
			return browserCryptoGetRandomValues
		}
	}

	// Splits a number string `bits`-length segments, after first
	// optionally zero-padding it to a length that is a multiple of `padLength.
	// Returns array of integers (each less than 2^bits-1), with each element
	// representing a `bits`-length segment of the input string from right to left,
	// i.e. parts[0] represents the right-most `bits`-length segment of the input string.
	function splitNumStringToIntArray(str, padLength) {
		var parts = [],
			i

		// If padLength is not 0, then pad the string to a multiple of padLength with leading zeros.
		if (padLength) {
			str = padLeft(str, padLength);
		}

		// console.log( "Padded Binary: '" + str + "'" );


		// Parse the binary string from the LSB by reading 'config.bits' bits at a time.
		// Default is 8 bits. The final value may not contain a full 8 bits.
		// Push resulting values into array. The 'parts' array will then be reversed
		// from the input binary string.
		for (i = str.length; i > config.bits; i -= config.bits) {
			parts.push( parseInt( str.slice( i - config.bits, i ), 2 ) );
		}

		parts.push( parseInt( str.slice( 0, i ), 2 ) );

		return parts
	}

	// Polynomial evaluation at `x` using Horner's Method
	// NOTE: fx=fx * x + coeff[i] ->  exp(log(fx) + log(x)) + coeff[i],
	//       so if fx===0, just set fx to coeff[i] because
	//       using the exp/log form will result in incorrect value
	function horner(x, coeffs) {
		var logx = config.logs[x],		// Look-up table for log results.
			fx = 0,						// Final polynomial evaluation value.
			i 							// Loop index.

		// Iterate through each coefficient in reverse order.
		// Calculate the intermediate value at each and add to sum.
		for ( i = coeffs.length - 1; i >= 0; i-- )
		{
			if (fx !== 0)
			{
				fx = config.exps[ ( logx + config.logs[ fx ] ) % config.maxShares ] ^ coeffs[ i ]
				// console.log( 	"i = " + i + ": fx = config.exps[ ( config.logs[ x ] + config.logs[ fx ] ) % config.maxShares ] ^ coeffs[ i ]\n" + 
				// 				        "          = config.exps[ ( config.logs[ " + x + " ] + config.logs[ " + fx + " ] ) % " + config.maxShares + " ] ^ coeffs[ " + i + " ]\n" +
				// 				        "          = config.exps[ ( " + logx + " + " + config.logs[ fx ] + " ) % " + config.maxShares + " ] ^ " + coeffs[ i ] + "\n" +
				// 				        "          = config.exps[ ( " + ( logx + config.logs[ fx ] ) + " ) % " + config.maxShares + " ] ^ " + coeffs[ i ] + "\n" + 
				// 				        "          = config.exps[ " + ( ( logx + config.logs[ fx ] ) % config.maxShares ) + " ] ^ " + coeffs[ i ] + "\n" + 
				// 				        "          = " + config.exps[ ( logx + config.logs[ fx ] ) % config.maxShares ] + " ^ " + coeffs[ i ] + "\n" + 
				// 				        "          = " + fx );
			} 
			else
			{
				fx = coeffs[i]
				// console.log( "i = " + i + ": fx = coeffs[ i ] = coeffs[ " + i + " ] = " + fx );
			}
		}

		return fx
	}

	// Evaluate the Lagrange interpolation polynomial at x = `at`
	// using x and y Arrays that are of the same length, with
	// corresponding elements constituting points on the polynomial.
	function lagrange(at, x, y) {
		var sum = 0,
			len,
			product,
			i,
			j

		for (i = 0, len = x.length; i < len; i++) {
			if (y[i]) {
				product = config.logs[y[i]]

				for (j = 0; j < len; j++) {
					if (i !== j) {
						if (at === x[j]) {
							// happens when computing a share that is in the list of shares used to compute it
							product = -1 // fix for a zero product term, after which the sum should be sum^0 = sum, not sum^1
							break
						}
						product =
							(product +
								config.logs[at ^ x[j]] -
								config.logs[x[i] ^ x[j]] +
								config.maxShares) %
							config.maxShares // to make sure it's not negative
					}
				}

				// though exps[-1] === undefined and undefined ^ anything = anything in
				// chrome, this behavior may not hold everywhere, so do the check
				sum = product === -1 ? sum : sum ^ config.exps[product]
			}
		}

		return sum
	}

	// This is the basic polynomial generation and evaluation function
	// for a `config.bits`-length secret (NOT an arbitrary length)
	// Note: no error-checking at this stage! If `secret` is NOT
	// a NUMBER less than 2^bits-1, the output will be incorrect!
	function getShares(secret, numShares, threshold) {
		var shares = [],
			coeffs = [secret],
			i,
			len

		// Generate random coefficients for the polynomial of degree (threshold + 1)
		// let funcStr = "f(x) = " + secret + " + ";
		for (i = 1; i < threshold; i++) {
			coeffs[i] = parseInt( config.rng(config.bits), 2 );
			// funcStr += coeffs[ i ] + "x^" + i + " " + ( ( i == threshold - 1  ) ? "" : "+ " );
		}
		// console.log( "Polynomial: " + funcStr );
		// console.log( "Coefficients: " + coeffs );


		// Compute the shares.
		let shareStr = "";
		for (i = 1, len = numShares + 1; i < len; i++) {
			// Create an object for each share.
			shares[i - 1] = {
				x: i,					// Share number.
				y: horner(i, coeffs)	// Polynomial evaluation.
			}

			// shareStr += "( " + shares[ i - 1 ].x + ", " + shares[ i - 1 ].y + " )" + ( ( i == len - 1 ) ? "" : ", " );
		}
		// console.log( "Shares: " + shareStr + "\n\n" );

		return shares
	}

	// Convert binary data into a share prepended with an id. 
	function constructPublicShareString(bits, id, data) {
		var bitsBase36, idHex, idMax, idPaddingLen, newShareString

		id = parseInt(id, config.radix) 							// Get the ID in the configured radix.
		bits = parseInt(bits, 10) || config.bits 					// If the number of bits isn't given, use config.bits.
		bitsBase36 = bits.toString(36).toUpperCase() 				// Calculate the number of bits in base36. 
		idMax = ( 1 << bits ) - 1									// Compute the maximum ID value as (2^bits - 1)
		idPaddingLen = idMax.toString(config.radix).length 			// Calculate the length of the ID value by converting the max ID value to a string in {radix} and getting the length. (Default: 2^8 - 1 = 255_{10} -> FF_{16} -> length 2)
		idHex = padLeft(id.toString(config.radix), idPaddingLen) 	// Convert the ID into a hex string padded to fit the padding length.

		// console.log( 	  "ID:                  " + id + 
		// 				"\nBits:                " + bits + 
		// 				"\nID Max:              " + idMax + 
		// 				"\nID Padding Length:   " + idPaddingLen + 
		// 				"\nID Hex:              " + idHex )

		if (typeof id !== "number" || id % 1 !== 0 || id < 1 || id > idMax) {
			throw new Error(
				"Share id must be an integer between 1 and " +
					idMax +
					", inclusive."
			)
		}


		// Compute the final share string.
		// Prepend the number of bits in base36 followed by the ID in hex.
		// Finally, add the share data in hex.
		newShareString = bitsBase36 + idHex + data

		return newShareString
	}

	// EXPORTED FUNCTIONS
	// //////////////////

	var secrets = {
		init: function(bits, rngType) {
			var logs = [],
				exps = [],
				x = 1,
				primitive,
				i

			// reset all config back to initial state
			reset()

			if (
				bits &&
				(typeof bits !== "number" ||
					bits % 1 !== 0 ||
					bits < defaults.minBits ||
					bits > defaults.maxBits)
			) {
				throw new Error(
					"Number of bits must be an integer between " +
						defaults.minBits +
						" and " +
						defaults.maxBits +
						", inclusive."
				)
			}

			if (rngType && CSPRNGTypes.indexOf(rngType) === -1) {
				throw new Error("Invalid RNG type argument : '" + rngType + "'")
			}

			config.radix = defaults.radix
			config.bits = bits || defaults.bits
			// config.size = Math.pow(2, config.bits)
			config.size = 1 << config.bits;
			config.maxShares = config.size - 1

			// Construct the exp and log tables for multiplication.
			primitive = defaults.primitivePolynomials[config.bits]
			// console.log( "Primitive = " + primitive );

			for (i = 0; i < config.size; i++) {
				exps[i] = x
				logs[x] = i
				x = x << 1 // Left shift assignment
				if (x >= config.size) {
					x = x ^ primitive // Bitwise XOR assignment
					x = x & config.maxShares // Bitwise AND assignment
				}
			}

			config.logs = logs
			config.exps = exps

			// console.log( "Logs = " + logs + "\nExps = " + exps + "\n\n" );

			if (rngType) {
				this.setRNG(rngType)
			}

			if (!isSetRNG()) {
				this.setRNG()
			}

			if (
				!isSetRNG() ||
				!config.bits ||
				!config.size ||
				!config.maxShares ||
				!config.logs ||
				!config.exps ||
				config.logs.length !== config.size ||
				config.exps.length !== config.size
			) {
				throw new Error("Initialization failed.")
			}
		},

		// Evaluates the Lagrange interpolation polynomial at x=`at` for
		// individual config.bits-length segments of each share in the `shares`
		// Array. Each share is expressed in base `inputRadix`. The output
		// is expressed in base `outputRadix'.
		combine: function(shares, at) {
			var i,
				j,
				len,
				len2,
				result = "",
				setBits,
				share,
				splitShare,
				x = [],
				y = []

			at = at || 0

			for (i = 0, len = shares.length; i < len; i++) {
				share = this.extractShareComponents(shares[i])

				// All shares must have the same bits settings.
				if (setBits === undefined) {
					setBits = share.bits
				} else if (share.bits !== setBits) {
					throw new Error(
						"Mismatched shares: Different bit settings."
					)
				}

				// Reset everything to the bit settings of the shares.
				if (config.bits !== setBits) {
					this.init(setBits)
				}

				// Proceed if this share.id is not already in the Array 'x' and
				// then split each share's hex data into an Array of Integers,
				// then 'rotate' those arrays where the first element of each row is converted to
				// its own array, the second element of each to its own Array, and so on for all of the rest.
				// Essentially zipping all of the shares together.
				//
				// e.g.
				//   [ 193, 186, 29, 150, 5, 120, 44, 46, 49, 59, 6, 1, 102, 98, 177, 196 ]
				//   [ 53, 105, 139, 49, 187, 240, 91, 92, 98, 118, 12, 2, 204, 196, 127, 149 ]
				//   [ 146, 211, 249, 167, 209, 136, 118, 114, 83, 77, 10, 3, 170, 166, 206, 81 ]
				//
				// becomes:
				//
				// [ [ 193, 53, 146 ],
				//   [ 186, 105, 211 ],
				//   [ 29, 139, 249 ],
				//   [ 150, 49, 167 ],
				//   [ 5, 187, 209 ],
				//   [ 120, 240, 136 ],
				//   [ 44, 91, 118 ],
				//   [ 46, 92, 114 ],
				//   [ 49, 98, 83 ],
				//   [ 59, 118, 77 ],
				//   [ 6, 12, 10 ],
				//   [ 1, 2, 3 ],
				//   [ 102, 204, 170 ],
				//   [ 98, 196, 166 ],
				//   [ 177, 127, 206 ],
				//   [ 196, 149, 81 ] ]
				//
				if (x.indexOf(share.id) === -1) {
					x.push(share.id)
					splitShare = splitNumStringToIntArray(hex2bin(share.data))
					for (j = 0, len2 = splitShare.length; j < len2; j++) {
						y[j] = y[j] || []
						y[j][x.length - 1] = splitShare[j]
					}
				}
			}

			// Extract the secret from the 'rotated' share data and return a
			// string of Binary digits which represent the secret directly. or in the
			// case of a newShare() return the binary string representing just that
			// new share.
			for (i = 0, len = y.length; i < len; i++) {
				result = padLeft(lagrange(at, x, y[i]).toString(2)) + result
			}

			// If 'at' is non-zero combine() was called from newShare(). In this
			// case return the result (the new share data) directly.
			//
			// Otherwise find the first '1' which was added in the share() function as a padding marker
			// and return only the data after the padding and the marker. Convert this Binary string
			// to hex, which represents the final secret result (which can be converted from hex back
			// to the original string in user space using `hex2str()`).
			return bin2hex(
				at >= 1 ? result : result.slice(result.indexOf("1") + 1)
			)
		},

		getConfig: function() {
			var obj = {}
			obj.radix = config.radix
			obj.bits = config.bits
			obj.maxShares = config.maxShares
			obj.hasCSPRNG = isSetRNG()
			obj.typeCSPRNG = config.typeCSPRNG
			return obj
		},

		// Given a public share, extract the bits (Integer), share ID (Integer), and share data (Hex)
		// and return an Object containing those components.
		extractShareComponents: function(share) {
			var bits,
				id,
				idLen,
				max,
				obj = {},
				regexStr,
				shareComponents

			// Extract the first char which represents the bits in Base 36
			bits = parseInt(share.substr(0, 1), 36)

			if (
				bits &&
				(typeof bits !== "number" ||
					bits % 1 !== 0 ||
					bits < defaults.minBits ||
					bits > defaults.maxBits)
			) {
				throw new Error(
					"Invalid share : Number of bits must be an integer between " +
						defaults.minBits +
						" and " +
						defaults.maxBits +
						", inclusive."
				)
			}

			// calc the max shares allowed for given bits
			// max = Math.pow(2, bits) - 1
			max = ( 1 << bits ) - 1;

			// Determine the ID length which is variable and based on the bit count.
			idLen = max.toString(config.radix).length

			// Extract all the parts now that the segment sizes are known.
			regexStr =
				"^([a-kA-K3-9]{1})([a-fA-F0-9]{" + idLen + "})([a-fA-F0-9]+)$"
			shareComponents = new RegExp(regexStr).exec(share)

			// The ID is a Hex number and needs to be converted to an Integer
			if (shareComponents) {
				id = parseInt(shareComponents[2], config.radix)
			}

			if (typeof id !== "number" || id % 1 !== 0 || id < 1 || id > max) {
				throw new Error(
					"Invalid share : Share id must be an integer between 1 and " +
						config.maxShares +
						", inclusive."
				)
			}

			if (shareComponents && shareComponents[3]) {
				obj.bits = bits
				obj.id = id
				obj.data = shareComponents[3]
				return obj
			}

			throw new Error("The share data provided is invalid : " + share)
		},

		// Set the PRNG to use. If no RNG function is supplied, pick a default using getRNG()
		setRNG: function(rng) {
			var errPrefix = "Random number generator is invalid ",
				errSuffix =
					" Supply an CSPRNG of the form function(bits){} that returns a string containing 'bits' number of random 1's and 0's."

			if (
				rng &&
				typeof rng === "string" &&
				CSPRNGTypes.indexOf(rng) === -1
			) {
				throw new Error("Invalid RNG type argument : '" + rng + "'")
			}

			// If RNG was not specified at all,
			// try to pick one appropriate for this env.
			if (!rng) {
				rng = getRNG()
			}

			// If `rng` is a string, try to forcibly
			// set the RNG to the type specified.
			if (rng && typeof rng === "string") {
				rng = getRNG(rng)
			}

			if (runCSPRNGTest) {
				if (rng && typeof rng !== "function") {
					throw new Error(errPrefix + "(Not a function)." + errSuffix)
				}

				if (rng && typeof rng(config.bits) !== "string") {
					throw new Error(
						errPrefix + "(Output is not a string)." + errSuffix
					)
				}

				if (rng && !parseInt(rng(config.bits), 2)) {
					throw new Error(
						errPrefix +
							"(Binary string output not parseable to an Integer)." +
							errSuffix
					)
				}

				if (rng && rng(config.bits).length > config.bits) {
					throw new Error(
						errPrefix +
							"(Output length is greater than config.bits)." +
							errSuffix
					)
				}

				if (rng && rng(config.bits).length < config.bits) {
					throw new Error(
						errPrefix +
							"(Output length is less than config.bits)." +
							errSuffix
					)
				}
			}

			config.rng = rng

			return true
		},

		// Converts a given UTF16 character string to the HEX representation.
		// Each character of the input string is represented by
		// `bytesPerChar` bytes in the output string which defaults to 2.
		str2hex: function(str, bytesPerChar) {
			var hexChars,
				max,
				out = "",
				neededBytes,
				num,
				i,
				len

			if (typeof str !== "string") {
				throw new Error("Input must be a character string.")
			}

			if (!bytesPerChar) {
				bytesPerChar = defaults.bytesPerChar
			}

			if (
				typeof bytesPerChar !== "number" ||
				bytesPerChar < 1 ||
				bytesPerChar > defaults.maxBytesPerChar ||
				bytesPerChar % 1 !== 0
			) {
				throw new Error(
					"Bytes per character must be an integer between 1 and " +
						defaults.maxBytesPerChar +
						", inclusive."
				)
			}

			hexChars = 2 * bytesPerChar
			// max = Math.pow(16, hexChars) - 1
			max = ( 1 << ( 4 * hexChars ) ) - 1

			for (i = 0, len = str.length; i < len; i++) {
				num = str[i].charCodeAt()

				if (isNaN(num)) {
					throw new Error("Invalid character: " + str[i])
				}

				if (num > max) {
					neededBytes = Math.ceil(Math.log(num + 1) / Math.log(256))
					throw new Error(
						"Invalid character code (" +
							num +
							"). Maximum allowable is 256^bytes-1 (" +
							max +
							"). To convert this character, use at least " +
							neededBytes +
							" bytes."
					)
				}

				out = padLeft(num.toString(16), hexChars) + out
			}
			// console.log( str, "\n", out );
			return out
		},

		// Converts a given HEX number string to a UTF16 character string.
		hex2str: function(str, bytesPerChar) {
			var hexChars,
				out = "",
				i,
				len

			if (typeof str !== "string") {
				throw new Error("Input must be a hexadecimal string.")
			}
			bytesPerChar = bytesPerChar || defaults.bytesPerChar

			if (
				typeof bytesPerChar !== "number" ||
				bytesPerChar % 1 !== 0 ||
				bytesPerChar < 1 ||
				bytesPerChar > defaults.maxBytesPerChar
			) {
				throw new Error(
					"Bytes per character must be an integer between 1 and " +
						defaults.maxBytesPerChar +
						", inclusive."
				)
			}

			hexChars = 2 * bytesPerChar

			str = padLeft(str, hexChars)

			for (i = 0, len = str.length; i < len; i += hexChars) {
				out =
					String.fromCharCode(
						parseInt(str.slice(i, i + hexChars), 16)
					) + out
			}

			// console.log( str, "\n", out );
			return out
		},

		// Generates a random bits-length number string using the PRNG
		random: function(bits) {
			if (
				typeof bits !== "number" ||
				bits % 1 !== 0 ||
				bits < 2 ||
				bits > 65536
			) {
				throw new Error(
					"Number of bits must be an Integer between 1 and 65536."
				)
			}

			return bin2hex(config.rng(bits))
		},

		// Divides a `secret` number String str expressed in radix `inputRadix` (optional, default 16)
		// into `numShares` shares, each expressed in radix `outputRadix` (optional, default to `inputRadix`),
		// requiring `threshold` number of shares to reconstruct the secret.
		// Optionally, zero-pads the secret to a length that is a multiple of padLength before sharing.
		share: function(secret, numShares, threshold, padLength) {
			let t0 = performance.now();

			var neededBits,
				subShares,
				x = new Array(numShares),
				y = new Array(numShares),
				i,
				j,
				len

			// Security:
			// For additional security, pad in multiples of 128 bits by default.
			// A small trade-off in larger share size to help prevent leakage of information
			// about small-ish secrets and increase the difficulty of attacking them.
			padLength = padLength || 128


			// Ensure that the secret is a string.
			if (typeof secret !== "string") {
				throw new Error("Secret must be a string.")
			}


			// Check that the number of shares is valid.
			if (   
				typeof numShares !== "number" ||    // Check that it is a Number type.
				numShares % 1 !== 0 ||              // Check that it is a whole number (the Number datatype is a double-precision 64-bit float).
				numShares < 2                       // Check that it is at least 2.
			) {
				throw new Error(
					"Number of shares must be an integer between 2 and 2^bits-1 (" +
						config.maxShares +
						"), inclusive."
				)
			}


			// Check that the number of shares is at most the max number of shares set during initialization.
			// config.maxShares is set in init(). Calculated as 2^(config.bits) - 1.
			if (numShares > config.maxShares) {
				neededBits = Math.ceil(Math.log(numShares + 1) / Math.LN2)
				throw new Error(
					"Number of shares must be an integer between 2 and 2^bits-1 (" +
						config.maxShares +
						"), inclusive. To create " +
						numShares +
						" shares, use at least " +
						neededBits +
						" bits."
				)
			}


			// Check that the threshold value is valid.
			if (
				typeof threshold !== "number" ||    // Check that it is a Number type.
				threshold % 1 !== 0 ||              // Check that it is a whole number (the Number datatype is a double-precision 64-bit float).
				threshold < 2                       // Check that it is at least 2.
			) {
				throw new Error(
					"Threshold number of shares must be an integer between 2 and 2^bits-1 (" +
						config.maxShares +
						"), inclusive."
				)
			}


			// Check that the threshold value is at most the max number of shares set during initializtion.
			// config.maxShares is set in init(). Calculated as 2^(config.bits) - 1.
			if (threshold > config.maxShares) {
				neededBits = Math.ceil(Math.log(threshold + 1) / Math.LN2)
				throw new Error(
					"Threshold number of shares must be an integer between 2 and 2^bits-1 (" +
						config.maxShares +
						"), inclusive.  To use a threshold of " +
						threshold +
						", use at least " +
						neededBits +
						" bits."
				)
			}


			// Check that the threshold value is at most the number of shares.
			if (threshold > numShares) {
				throw new Error(
					"Threshold number of shares was " +
						threshold +
						" but must be less than or equal to the " +
						numShares +
						" shares specified as the total to generate."
				)
			}


			// Check that the pad length is valid.
			if (
				typeof padLength !== "number" ||    // Check that it is a Number type.
				padLength % 1 !== 0 ||              // Check that it is a whole number (the Number datatype is a double-precision 64-bit float).
				padLength < 0 ||                    // Valid value is between 0 and 1024, inclusive.
				padLength > 1024
			) {
				throw new Error(
					"Zero-pad length must be an integer between 0 and 1024 inclusive."
				)
			}
/*
			let t1 = performance.now();
			console.log( "Initialization: " + ( t1 - t0 ) + "milliseconds." );
			t0 = performance.now();
*/
			// Convert the hex string secret to binary representation.
			// Prepend a 1 as a marker so that we can preserve the correct
			// number of leading zeros in our secret.
			secret = "1" + hex2bin( secret );
			// console.log( "Binary: '" + secret + "'" );
/*
			t1 = performance.now();
			console.log( "hex2bin: " + ( t1 - t0 ) + "milliseconds." );
			t0 = performance.now();
*/
			// Split the binary string into an array of integers.
			// First left pads with zeros to a multiple of padLength,
			// then parses from the LSB in increments of config.bits (8 bits by default).
			secret = splitNumStringToIntArray( secret, padLength );
/*
			t1 = performance.now();
			console.log( "splitNumStringToIntArray: " + ( t1 - t0 ) + "milliseconds." );
			t0 = performance.now();
*/
			// console.log( "Int Array: '" + secret + "'" );


			// Iterate through each integer in the array generated previously.
			for( i = 0, len = secret.length; i < len; i++ )
			{
				// Produce numShares objects. Each object has an x and y key.
				// The x key is the value the polynomial is evaluated at and y is the result.
				subShares = getShares(secret[i], numShares, threshold)
				
				// 
				for (j = 0; j < numShares; j++) {
					// Conver the x values to hex format. 
					x[j] = x[j] || subShares[j].x.toString(config.radix)

					// Convert the y result into a (config.bits)-bit (default: 8) binary value and append to the front of the string.
					y[j] = padLeft(subShares[j].y.toString(2)) + (y[j] || "")
				}
			}
/*
			t1 = performance.now();
			console.log( "getShares: " + ( t1 - t0 ) + "milliseconds." );
			t0 = performance.now();
*/
			// console.log( "x: " + x + "\ny: " + y + "\n\n" );

			// Get the final share strings in hex.
			for ( i = 0; i < numShares; i++ )
			{
				x[ i ] = constructPublicShareString(
					config.bits,		// Number of bits.
					x[ i ],				// ID value.
					bin2hex( y[ i ] )	// Data.
				)
			}
/*
			t1 = performance.now();
			console.log( "constructPublicShareString: " + ( t1 - t0 ) + "milliseconds." );
*/
			return x
		},

		// Generate a new share with id `id` (a number between 1 and 2^bits-1)
		// `id` can be a Number or a String in the default radix (16)
		newShare: function(id, shares) {
			var share, radid

			if (id && typeof id === "string") {
				id = parseInt(id, config.radix)
			}

			radid = id.toString(config.radix)

			if (id && radid && shares && shares[0]) {
				share = this.extractShareComponents(shares[0])
				return constructPublicShareString(
					share.bits,
					radid,
					this.combine(shares, id)
				)
			}

			throw new Error(
				"Invalid 'id' or 'shares' Array argument to newShare()."
			)
		},

		/* test-code */
		// export private functions so they can be unit tested directly.
		_reset: reset,
		_padLeft: padLeft,
		_hex2bin: hex2bin,
		_bin2hex: bin2hex,
		_hasCryptoGetRandomValues: hasCryptoGetRandomValues,
		_hasCryptoRandomBytes: hasCryptoRandomBytes,
		_getRNG: getRNG,
		_isSetRNG: isSetRNG,
		_splitNumStringToIntArray: splitNumStringToIntArray,
		_horner: horner,
		_lagrange: lagrange,
		_getShares: getShares,
		_constructPublicShareString: constructPublicShareString
		/* end-test-code */
	}

	// Always initialize secrets with default settings.
	secrets.init()

	return secrets
})
