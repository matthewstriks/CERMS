let githubLink = document.getElementById('githubLink')
let sbmtTicket = document.getElementById('sbmtTicket')
let sbmtTicket2 = document.getElementById('sbmtTicket2')
let supportTicketDiv = document.getElementById('supportTicketDiv')
let ticketType = document.getElementById('ticketType')
let ticketSubject = document.getElementById('ticketSubject')
let ticketMessage = document.getElementById('ticketMessage')
let ticketSubmitBtn = document.getElementById('ticketSubmitBtn')


if (githubLink) {
  githubLink.addEventListener('click', function(){
    ipcRenderer.send('github-link')
  })
}

if (sbmtTicket) {
  sbmtTicket2.style.display = 'none'
  sbmtTicket.addEventListener('click', function(){
    supportTicketDiv.style.display = ''
    sbmtTicket.style.display = 'none'
    sbmtTicket2.style.display = ''
  })
}

if (sbmtTicket2) {
  sbmtTicket2.addEventListener('click', function(){
    sbmtTicket.style.display = ''
    sbmtTicket2.style.display = 'none'
    supportTicketDiv.style.display = 'none'
    ticketType.value = 0
    ticketSubject.value = ""
    ticketMessage.value = ""
  })
}

if (supportTicketDiv) {
  supportTicketDiv.style.display = 'none'
}

if (ticketSubmitBtn) {
  ticketSubmitBtn.addEventListener('click', function(){
    ipcRenderer.send('submit-support-ticket', Array(ticketType.value, ticketSubject.value, ticketMessage.value))
    sbmtTicket2.click()
  })
}