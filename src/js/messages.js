let searchInput = document.getElementById("contactSearch");
let theChatDiv = document.getElementById("theChatDiv");
let contactsList = document.getElementById("contactsList");
let messageInput = document.getElementById("messageInput");
let chatForm = document.getElementById("chatForm");
let sendMessage = document.getElementById("sendMessage");
let messagesList = document.getElementById("messagesList");

let contacts = [];
let chatsData = [];
let currentContactId = null;

if (theChatDiv) {
  ipcRenderer.send("request-users");
  ipcRenderer.send("receive-chats");
}

ipcRenderer.on("recieve-users", (event, contact) => {
  if (contact[0] == theUID) {
    return;
  }
  const li = document.createElement("li");
  li.className = "list-group-item contact-item";
  li.textContent = contact[1].displayName;
  li.setAttribute("data-id", contact[0]);
  li.addEventListener("click", () => openContactMessages(contact[0]));
  contactsList.appendChild(li);
  contacts.push({ id: contact[0], name: contact[1].displayName });
  console.log(contacts);
});

searchInput.addEventListener("input", function () {
  const filter = searchInput.value.toLowerCase();
  const contacts = contactsList.getElementsByTagName("li");

  for (let i = 0; i < contacts.length; i++) {
    let contactName = contacts[i].textContent || contacts[i].innerText;
    if (contactName.toLowerCase().indexOf(filter) > -1) {
      contacts[i].style.display = "";
    } else {
      contacts[i].style.display = "none";
    }
  }
});

chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!messageInput.value) {
        return;
    }
    ipcRenderer.send('send-chat', { to: currentContactId, message: messageInput.value });
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", "sent");
    messageDiv.innerHTML = `
        <div class="message-text">${messageInput.value}</div>
        <div class="timestamp"></div>
    `;
    messagesList.appendChild(messageDiv);
    messageInput.value = "";
});

ipcRenderer.on("return-chats", (event, chats) => {
    console.log(chats);
    chatsData = chats;
});

function openContactMessages(contactId) {
  // Find the chat where the participants include contactId and the current user
    currentContactId = contactId;
    sendMessage.disabled = false;
    messageInput.disabled = false;
    messageInput.focus();
  const chat = chatsData.find(
    ([chatId, chatData]) =>
      chatData.participants.includes(contactId) &&
      chatData.participants.includes(theUID)
  );

  if (!chat) {
    console.warn("Chat not found with participant:", contactId);
    return;
  }

  const [chatId, chatData] = chat;

  // Update the UI with the chat's messages
  let theContactName = contacts.find((contact) => contact.id == contactId).name;
  document.getElementById("currentContact").textContent = theContactName;
  messagesList.innerHTML = ""; // Clear previous messages

  chatData.messages.forEach((msg) => {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add(
      "message",
      msg.senderId === theUID ? "sent" : "received"
    );
    messageDiv.innerHTML = `
      <div class="message-text">${msg.message}</div>
      <div class="timestamp">${new Date(
        msg.timestamp?.seconds * 1000
      ).toLocaleString()}</div>
    `;
    messagesList.appendChild(messageDiv);
  });

  // Enable message input for this chat
  document.getElementById("messageInput").disabled = false;
  document.getElementById("sendMessage").disabled = false;
  document.getElementById("messageInput").dataset.chatId = chatId;
}
