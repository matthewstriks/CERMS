let githubLink = document.getElementById('githubLink')
let sbmtTicket = document.getElementById('sbmtTicket')
let sbmtTicket2 = document.getElementById('sbmtTicket2')
let supportTicketDiv = document.getElementById('supportTicketDiv')
let ticketType = document.getElementById('ticketType')
let typeLbl = document.getElementById('typeLbl')
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

if (ticketType) {
  ticketType.addEventListener('change', function(){
    if (ticketType.value == '0') {
      typeLbl.innerHTML = ''
    } else if (ticketType.value == '1') {
      // General
      typeLbl.innerHTML = 'Used for general support questions'
    } else if (ticketType.value == '2') {
      // Bug Report
      typeLbl.innerHTML = 'Used for bugs in the system if you notice somehting does not act correctly or does not look right.'
    } else if (ticketType.value == '3') {
      // Error Report
      typeLbl.innerHTML = 'Used for errors in the system. If something specifically breaks the system or you get an actual error message.'
    } else if (ticketType.value == '4') {
      // Feature Request
      typeLbl.innerHTML = 'Used for requesting new features or additions to pre-existing ones'
    } else if (ticketType.value == '5') {
      // Report Request
      typeLbl.innerHTML = 'Used to request a data report. For example, "I want to see all members with this membership." reports will be provided in Excel if appropriate.'
    } else {
      // Else
      typeLbl.innerHTML = ''
    }
  })
}