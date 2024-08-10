document.addEventListener('DOMContentLoaded', function () {
    const employees = ["John Doe", "Jane Smith", "Mike Johnson", "Anna Williams"];
    const chats = [];
    let currentChat = null;
    let typingTimeout = null;

    function loadEmployeeList() {
        const employeeList = document.getElementById('employeeList');
        employeeList.innerHTML = '';
        employees.forEach(employee => {
            const employeeItem = document.createElement('li');
            employeeItem.classList.add('list-group-item');
            employeeItem.textContent = employee;
            employeeItem.addEventListener('click', function () {
                startChat(employee);
                const newMessageModal = document.getElementById('newMessageModal');
                if (newMessageModal) {
                    const modalInstance = new bootstrap.Modal(newMessageModal);
                    modalInstance.hide();
                }
            });
            employeeList.appendChild(employeeItem);
        });
    }

    function loadChatList() {
        const chatsElement = document.getElementById('chats');
        chatsElement.innerHTML = '';
        chats.forEach(chat => {
            const chatItem = document.createElement('div');
            chatItem.classList.add('chat-list-item');
            chatItem.innerHTML = `
            <div>${chat.name}</div>
            <div class="message-preview">${chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].text : 'No messages yet.'} <span class="time">${chat.messages.length > 0 ? formatTime(chat.messages[chat.messages.length - 1].timestamp) : ''}</span></div>
        `;
            chatItem.addEventListener('click', function () {
                selectChat(chat);
            });
            chatsElement.appendChild(chatItem);
        });
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
        document.getElementById('fileInput').disabled = false;
        document.getElementById('searchInput').disabled = false;
        const chatBody = document.getElementById('chatBody');
        if (chatBody) {
            chatBody.innerHTML = '';
            chat.messages.forEach(message => {
                addMessageToChatBody(message.text, message.type, message.timestamp);
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
        chat.read = true;
    }

    function addMessageToChatBody(text, type, timestamp) {
        const chatBody = document.getElementById('chatBody');
        const messageClass = type === 'sent' ? 'sent' : 'received';
        const messageHtml = `
            <div class="message ${messageClass}">
                ${text}
                <div class="timestamp">${formatTime(timestamp)}</div>
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
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.style.display = 'block';
        }
        typingTimeout = setTimeout(() => {
            if (typingIndicator) {
                typingIndicator.style.display = 'none';
            }
        }, 2000);
    }

    document.getElementById('messageInput').addEventListener('input', handleTyping);

    document.getElementById('sendMessageBtn').addEventListener('click', function () {
        const text = document.getElementById('messageInput').value;
        if (text && currentChat) {
            const timestamp = Date.now();
            currentChat.messages.push({ text, type: 'sent', timestamp });
            addMessageToChatBody(text, 'sent', timestamp);
            document.getElementById('messageInput').value = '';
        }
    });

    document.getElementById('attachmentBtn').addEventListener('click', function () {
        document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', function (event) {
        // Handle file upload here
        alert('File selected: ' + event.target.files[0].name);
    });

    document.getElementById('searchInput').addEventListener('input', function () {
        const query = this.value.toLowerCase();
        const messages = document.querySelectorAll('#chatBody .message');
        messages.forEach(message => {
            const text = message.textContent.toLowerCase();
            message.style.display = text.includes(query) ? 'block' : 'none';
        });
    });

    document.getElementById('toggleSidebarBtn').addEventListener('click', function () {
        const chatList = document.getElementById('chatList');
        const chatMain = document.getElementById('chatMain');
        if (chatList && chatMain) {
            chatList.classList.toggle('collapsed');
            chatMain.classList.toggle('expanded');
        }
    });

    document.getElementById('collapsedButton').addEventListener('click', function () {
        const chatList = document.getElementById('chatList');
        const chatMain = document.getElementById('chatMain');
        if (chatList && chatMain) {
            chatList.classList.remove('collapsed');
            chatMain.classList.remove('expanded');
        }
    });

    loadEmployeeList();
    loadChatList();
});
