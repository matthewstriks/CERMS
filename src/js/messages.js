let theChatDiv = document.getElementById('theChatDiv')
let contactsList = document.getElementById('contactsList');
let messageInput = document.getElementById('messageInput');

let contacts = [];
let chatData = {};
let currentContactId = null;

if (theChatDiv) {
    ipcRenderer.send('request-users')
    ipcRenderer.send('receive-chat-messages')    
}

ipcRenderer.on('recieve-users', (event, contact) => {
    if (contact[0] == theUID) {
        return;       
    }
    const li = document.createElement('li');
    li.className = 'list-group-item contact-item';
    li.textContent = contact[1].displayName;
    li.setAttribute('data-id', contact[0]);
    li.addEventListener('click', () => selectContact(contact));
    contactsList.appendChild(li);
    contacts.push({ id: contact[0], name: contact[1].displayName });
    console.log(contacts);
    
})

ipcRenderer.on('return-chat-messages', (event, chat) => {
    console.log(chat);    
    chat.forEach(theChat => {
        let theContactID = false
        theChat[1].participants.forEach(participant => {
            if (participant != theUID) {
                theContactID = participant                
            }
        });
        if (!chatData[theContactID]) chatData[theContactID] = [];

        theChat[2].forEach(message => {
            let theMessage = {
                text: message[1].message,
                timestamp: message[1].timestamp,
                sent: message[1].sender == theUID,
                newMsg: false
            }
            chatData[theContactID].push(theMessage);
        });
    });
})

ipcRenderer.on('add-chat-message', (event, chat) => {
    console.log('add-chat-message');    
    console.log(chat);    
    let theContactID = chat[0]
    let theMessage = {
        text: chat[1].message,
        timestamp: chat[1].timestamp,
        sent: chat[1].sender == theUID,
        newMsg: false
    }
    chatData[theContactID].push(theMessage);
})

function selectContact(contact) {
    currentContactId = contact[0];
    document.getElementById('currentContact').textContent = `Chatting with ${contact[1].displayName}`;
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendMessage').disabled = false;
    messageInput.focus();
    loadMessages(contact[0]);
}

function loadMessages(contactId) {
    console.log(chatData);
    const messagesList = document.getElementById('messagesList');
    messagesList.innerHTML = '';
    if (chatData[contactId]) {
    chatData[contactId].forEach(message => displayMessage(message));
    
    }
}

function displayMessage({ text, timestamp, sent, newMsg }) {
    if (!sent && newMsg) {
        var audio = new Audio('./assets/alert-sound.mp3');
        audio.play();
    }
    const messagesList = document.getElementById('messagesList');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sent ? 'sent' : 'received'}`;

    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    messageText.textContent = text;

    const messageDate = new Date(timestamp.seconds * 1000 + timestamp.nanoseconds / 1000000);
    const currentDate = new Date();
    const isToday = messageDate.toDateString() === currentDate.toDateString();

    const timestampDiv = document.createElement('div');
    timestampDiv.className = 'timestamp';
    if (isToday) {
        timestampDiv.textContent = messageDate.toLocaleTimeString();
    } else {
        timestampDiv.textContent = messageDate.toLocaleDateString() + ' ' + messageDate.toLocaleTimeString();
    }
    
    messageDiv.appendChild(messageText);
    messageDiv.appendChild(timestampDiv);

    messagesList.appendChild(messageDiv);
    messagesList.scrollTop = messagesList.scrollHeight;
}

document.getElementById('sendMessage').addEventListener('click', () => {
    const messageText = messageInput.value.trim();
    if (!messageText || !currentContactId) return;
    ipcRenderer.send('send-message', { contactId: currentContactId, message: messageText });
    messageInput.value = '';
    messageInput.focus()
});
