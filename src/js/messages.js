const employees = [];
const employeesFull = Array()
const chats = [];

ipcRenderer.send("request-users")
ipcRenderer.send("request-chats")

ipcRenderer.on("recieve-users", (event, arg) => {
    employees.push(arg[1].displayName)  
    employeesFull.push(Array(arg[0], arg[1])) 
    const employeeList = document.getElementById('employeeList');
    let employee = arg
    const employeeItem = document.createElement('li');
    employeeItem.classList.add('list-group-item');
    employeeItem.textContent = employee[1].displayName;
    employeeItem.id = employee[0]
    employeeItem.addEventListener('click', function () {
        startChat(employee[1].displayName);
        // Close the modal after selecting an employee
        const newMessageModal = document.getElementById('newMessageModal');
        const modalInstance = bootstrap.Modal.getInstance(newMessageModal);
        if (modalInstance) {
            modalInstance.hide();
        }
    });
    employeeList.appendChild(employeeItem);     
})

let currentChat = null;
let typingTimeout = null;

function loadChatList() {
    const chatsElement = document.getElementById('chats');
    chatsElement.innerHTML = '';

    // Sort chats so pinned chats appear first
    const sortedChats = [...chats].sort((a, b) => b.pinned - a.pinned);

    sortedChats.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.classList.add('chat-list-item');
        chatItem.innerHTML = `
            <div>${chat.name}</div>
            <div class="message-preview">
                ${chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].text : 'No messages yet.'}
                <span class="time">${chat.messages.length > 0 ? formatTime(chat.messages[chat.messages.length - 1].timestamp) : ''}</span>
                <button class="btn btn-sm btn-outline-secondary ms-2 pin-btn">${chat.pinned ? 'Unpin' : 'Pin'}</button>
                <button class="btn btn-sm btn-outline-danger ms-2 remove-btn">Remove</button>
            </div>
        `;

        chatItem.querySelector('.pin-btn').addEventListener('click', function () {
            chat.pinned = !chat.pinned;
            loadChatList();
        });

        chatItem.querySelector('.remove-btn').addEventListener('click', function () {
            const chatIndex = chats.indexOf(chat);
            if (chatIndex > -1) {
                chats.splice(chatIndex, 1);
                loadChatList();
                // Clear chat details if current chat is removed
                if (currentChat === chat) {
                    clearChatDetails();
                }
            }
        });

        chatItem.addEventListener('click', function () {
            selectChat(chat);
        });

        chatsElement.appendChild(chatItem);
    });
}

function clearChatDetails() {
    currentChat = null;
    const chatHeader = document.getElementById('chatHeader');
    if (chatHeader) {
        chatHeader.querySelector('h4').textContent = 'Select a chat';
    }
    const chatBody = document.getElementById('chatBody');
    if (chatBody) {
        chatBody.innerHTML = '';
    }
    document.getElementById('messageInput').disabled = true;
    document.getElementById('sendMessageBtn').disabled = true;
    document.getElementById('searchInput').disabled = true;
}

function startChat(employeeName) {
    const chat = {
        name: employeeName,
        messages: [],
        typing: false,
        read: false,
        pinned: false,
        archived: false
    };
    chats.push(chat);
    loadChatList();
    selectChat(chat);
}

function selectChat(chat) {
    currentChat = chat;
    const chatHeader = document.getElementById('chatHeader');
    if (chatHeader) {
        chatHeader.querySelector('h4').textContent = chat.name;
    }
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendMessageBtn').disabled = false;
    document.getElementById('searchInput').disabled = false;
    const chatBody = document.getElementById('chatBody');
    if (chatBody) {
        chatBody.innerHTML = '';
        chat.messages.forEach(message => {
            addMessageToChatBody(message.text, message.type, message.timestamp, message.read);
        });
    }
    const chatListItems = document.querySelectorAll('#chats .chat-list-item');
    chatListItems.forEach(item => {
        item.classList.remove('active');
        if (item.textContent.includes(chat.name)) {
            item.classList.add('active');
        }
    });
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.style.display = 'none';
    }
    chat.read = true; // Mark chat as read when selected
    updateChatListPreview(chat);
}

function addMessageToChatBody(text, type, timestamp, read = true) {
    const chatBody = document.getElementById('chatBody');
    const messageClass = type === 'sent' ? 'sent' : 'received';
    const messageHtml = `
        <div class="message ${messageClass}">
            ${text}
            <div class="timestamp">${formatTime(timestamp)} ${read ? '<i class="fas fa-check-double text-primary"></i>' : '<i class="fas fa-check text-secondary"></i>'}</div>
        </div>
    `;
    if (chatBody) {
        chatBody.insertAdjacentHTML('beforeend', messageHtml);
        chatBody.scrollTop = chatBody.scrollHeight;
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return `${date.getHours()}:${date.getMinutes()}`;
}

function handleTyping() {
    let typingIndicator = document.getElementById('typingIndicator');
    if (!typingIndicator) {
        return
    }
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    if (typingIndicator) {
        typingIndicator.style.display = 'block';
    }
    console.log(typingIndicator);
    
    // Simulate typing animation with dots
    let dots = '';
    const typingInterval = setInterval(() => {
        dots = dots.length < 3 ? dots + '.' : '';
        typingIndicator.innerHTML = `Typing${dots}`;
    }, 500);

    typingTimeout = setTimeout(() => {
        clearInterval(typingInterval);
        if (typingIndicator) {
            typingIndicator.style.display = 'none';
        }
    }, 2000);
}

function updateChatListPreview(chat) {
    const chatItem = [...document.querySelectorAll('#chats .chat-list-item')].find(item => item.textContent.includes(chat.name));
    if (chatItem && chat.messages.length > 0) {
        const lastMessage = chat.messages[chat.messages.length - 1];
        chatItem.querySelector('.message-preview').innerHTML = `${lastMessage.text} <span class="time">${formatTime(lastMessage.timestamp)}</span>`;
    }
}

document.getElementById('messageInput').addEventListener('input', handleTyping);

document.getElementById('messageInput').addEventListener("keypress", function (event) {
    // If the user presses the "Enter" key on the keyboard
    if (event.key === "Enter") {
        // Cancel the default action, if needed
        event.preventDefault();
        // Trigger the button element with a click
        document.getElementById("sendMessageBtn").click();
    }
});

document.getElementById('sendMessageBtn').addEventListener('click', function () {
    const text = document.getElementById('messageInput').value;
    if (text && currentChat) {
        const timestamp = Date.now();
//        currentChat.messages.push({ text, type: 'sent', timestamp, read: true });
//        addMessageToChatBody(text, 'sent', timestamp);
        ipcRenderer.send('send-chat', Array("Mwym2HylwNTAxei24Obw", document.getElementById('messageInput').value))
        document.getElementById('messageInput').value = '';
        loadChatList();
    }
});

document.getElementById('searchInput').addEventListener('input', function () {
    const query = this.value.toLowerCase();
    const messages = document.querySelectorAll('#chatBody .message');
    messages.forEach(message => {
        const text = message.textContent.toLowerCase();
        message.style.display = text.includes(query) ? 'block' : 'none';
    });
});

loadChatList();

ipcRenderer.on('return-chats', (event, arg) => {
    console.log(arg);
    arg[1].forEach(chat => {
        let employeeNames = ""
        chat[1].participants.forEach(participant => {
            if (participant == arg[0]) {
                return
            }
            employeesFull.forEach(employee => {
                if (participant == employee[0]) {
                    if (employeeNames == "") {
                        employeeNames = employee[1].displayName
                    } else {
                        employeeNames = employeeNames + ', ' + employee[1].displayName
                    }
                }
            });
        });
        startChat(employeeNames)   
        chat[2].forEach(message => {
            theType = 'received'                        
            if (message[1].sender == arg[0]) {
                theType = 'sent'
            }
            let theTimestamp = new Date(message[1].timestamp.seconds * 1000);
            addMessageToChatBody(message[1].message, theType, theTimestamp, message[1].read)            
        })     
    });
})

ipcRenderer.on('add-chat-message', (event, arg) => {
    console.log(arg);
    
    theType = 'received'
    if (arg[1].sender == arg[0]) {
        theType = 'sent'
    }
    let theTimestamp = new Date()
    if (arg[1].timestamp) {
        theTimestamp = new Date(arg[1].timestamp.seconds * 1000);        
    }
    addMessageToChatBody(arg[1].message, theType, theTimestamp, arg[1].read)            
})