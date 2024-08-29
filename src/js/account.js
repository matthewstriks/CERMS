// User Settings
let displayDiv = document.getElementById('displayDiv')
let editDiv = document.getElementById('editDiv')
let displayName = document.getElementById('displayName')
let displayNameEdit = document.getElementById('displayNameEdit')
let roleTxt = document.getElementById('roleTxt')
let emailTxt = document.getElementById('emailTxt')
let editEmail = document.getElementById('editEmail')
let editPassword = document.getElementById('editPassword')
let editPassword2 = document.getElementById('editPassword2')
let editAccountBtn = document.getElementById('editAccountBtn')
let saveAccountBtn = document.getElementById('saveAccountBtn')
let cancelBtn = document.getElementById('cancelBtn')
let verifyEMailDisplay = document.getElementById('verifyEMailDisplay')
let verifyEMailBtn = document.getElementById('verifyEMailBtn')
let darkModeToggle2 = document.getElementById('darkModeToggle2')
let notidicationSecondsEdit = document.getElementById('notidicationSecondsEdit')

// System Settings
let updateBtn = document.getElementById('updateBtn')
let changelogBtn = document.getElementById('changelogBtn')
let businessSettingsDisplay = document.getElementById('businessSettingsDisplay')
let businessName = document.getElementById('businessName')
let businessAddress = document.getElementById('businessAddress')
let businessAddress2 = document.getElementById('businessAddress2')
let businessPNum = document.getElementById('businessPNum')
let businessEMail = document.getElementById('businessEMail')
let editBusinessSettingsBtn = document.getElementById('editBusinessSettingsBtn')
let businessSettingsEdit = document.getElementById('businessSettingsEdit')
let businessNameEdit = document.getElementById('businessNameEdit')
let businessAddressEdit = document.getElementById('businessAddressEdit')
let businessAddress2Edit = document.getElementById('businessAddress2Edit')
let businessPNumEdit = document.getElementById('businessPNumEdit')
let businessEMailEdit = document.getElementById('businessEMailEdit')
let saveBusinessSettingsBtn = document.getElementById('saveBusinessSettingsBtn')
let cancelBusinessSettingsBtn = document.getElementById('cancelBusinessSettingsBtn')
let businessWaiverSettingsDisplay = document.getElementById('businessWaiverSettingsDisplay')
let businessWaiverSettingsEdit = document.getElementById('businessWaiverSettingsEdit')
let editWaiverSettingsBtn = document.getElementById('editWaiverSettingsBtn')
let theWaiver = document.getElementById('theWaiver')
let theWaiverEdit = document.getElementById('theWaiverEdit')
let saveBusinessWaiverSettingsBtn = document.getElementById('saveBusinessWaiverSettingsBtn')
let cancelBusinessWaiverSettingsBtn = document.getElementById('cancelBusinessWaiverSettingsBtn')
let enableSignatureSigningSwitch = document.getElementById('enableSignatureSigningSwitch')
let quickbooksConnect = document.getElementById('quickbooksConnect')
let quickbooksDisConnect = document.getElementById('quickbooksDisConnect')
let importProductsQB = document.getElementById('importProductsQB')
let importProductsQBBtn = document.getElementById('importProductsQBBtn')
let debugModeSwitch = document.getElementById('debugModeSwitch')
let importMembershipModeSwitch = document.getElementById('importMembershipModeSwitch')
let saveDirTxt = document.getElementById('saveDirTxt')
let editModalDirs = document.getElementById('editModalDirs')
let editSaveDir = document.getElementById('editSaveDir')
let hideNPPSwitch = document.getElementById('hideNPPSwitch')
let invWarnEMailDiv = document.getElementById('invWarnEMailDiv')
let invWarnEMail = document.getElementById('invWarnEMail')
let invWarnEMailBtn = document.getElementById('invWarnEMailBtn')
let checkoutMsgDiv = document.getElementById('checkoutMsgDiv')
let checkoutMsg = document.getElementById('checkoutMsg')
let checkoutMsgBtn = document.getElementById('checkoutMsgBtn')
let bshiftTime = document.getElementById('bshiftTime')
let cshiftTime = document.getElementById('cshiftTime')
let ashiftTime = document.getElementById('ashiftTime')
let shiftTimeDiv = document.getElementById('shiftTimeDiv')
let shiftTimeBtn = document.getElementById('shiftTimeBtn')
let includeExpireTimeRenewSwitch = document.getElementById('includeExpireTimeRenewSwitch')
let mandatoryDNANotesSwitch = document.getElementById('mandatoryDNANotesSwitch')
let enableRegisterSystem = document.getElementById('enableRegisterSystem')

// Accounts
let editingID;
let creatingAccount;
let editAccountDiv = document.getElementById('editAccountDiv')
let editingDisplayName = document.getElementById('editingDisplayName')
let editingEMail = document.getElementById('editingEMail')
let editingRank = document.getElementById('editingRank')
let editingAccessCodeDiv = document.getElementById('editingAccessCodeDiv')
let editingAccessCode = document.getElementById('editingAccessCode')
let permissionViewProductsPage = document.getElementById('permissionViewProductsPage')
let permissionEditCategory = document.getElementById('permissionEditCategory')
let permissionEditProducts = document.getElementById('permissionEditProducts')
let permissionEditCoreProducts = document.getElementById('permissionEditCoreProducts')
let permissionEditDiscounts = document.getElementById('permissionEditDiscounts')
let permissionWaiveProducts = document.getElementById('permissionWaiveProducts')
let permissionEditSystemSettings = document.getElementById('permissionEditSystemSettings')
let permissionEditRegisters = document.getElementById('permissionEditRegisters')
let permissionImportMemberMode = document.getElementById('permissionImportMemberMode')
let permissionEditDNAAdd = document.getElementById('permissionEditDNAAdd')
let permissionEditDNARemove = document.getElementById('permissionEditDNARemove')
let permissionEditTagAdd = document.getElementById('permissionEditTagAdd')
let permissionEditTagRemove = document.getElementById('permissionEditTagRemove')
let permissionEditMemberNotes = document.getElementById('permissionEditMemberNotes')
let permissionEditMemberFiles = document.getElementById('permissionEditMemberFiles')
let permissionDeleteMembers = document.getElementById('permissionDeleteMembers')
let permissionEditAnalytics = document.getElementById('permissionEditAnalytics')
let permissionEditVDTransactions = document.getElementById('permissionEditVDTransactions')
let permissionEditQBConnect = document.getElementById('permissionEditQBConnect')
let editAccountSave = document.getElementById('editAccountSave')
let editAccountCancel = document.getElementById('editAccountCancel')
let addAccountBtn = document.getElementById('addAccountBtn')
let userAccounts = document.getElementById('userAccounts')

//let  = document.getElementById('')


// User Settings
if (displayDiv) {
    editDiv.style.display = 'none'
}

editAccountBtn.addEventListener('click', function(){
    editDiv.style.display = ''
    displayDiv.style.display = 'none'

})

saveAccountBtn.addEventListener('click', function(){
    ipcRenderer.send("settings-update-Account", Array(displayNameEdit.value, editEmail.value, editPassword.value, editPassword2.value))
})

cancelBtn.addEventListener('click', function(){
    editDiv.style.display = 'none'
    displayDiv.style.display = ''
})

verifyEMailBtn.addEventListener('click', function(){
    ipcRenderer.send('settings-verify-email')
})

darkModeToggle2.addEventListener('click', function(){
    document.getElementById('darkModeToggle').click()
})

notidicationSecondsEdit.addEventListener('change', function(){
    ipcRenderer.send('settings-update-notification-seconds', notidicationSecondsEdit.value)
})

// System Settings 

updateBtn.addEventListener('click', function(){
    ipcRenderer.send('request-update')
})

changelogBtn.addEventListener('click', function(){
    ipcRenderer.send('request-changelog')
})

if (businessSettingsDisplay) {
    businessSettingsEdit.style.display = 'none'
}

if (businessWaiverSettingsEdit) {
    businessWaiverSettingsEdit.style.display = 'none'
}

if (businessWaiverSettingsDisplay) {
    businessWaiverSettingsEdit.style.display = 'none'
}

editBusinessSettingsBtn.addEventListener('click', function(){
    businessSettingsDisplay.style.display = 'none'
    businessSettingsEdit.style.display = ''
})

editWaiverSettingsBtn.addEventListener('click', function(){
    businessWaiverSettingsDisplay.style.display = 'none'
    businessWaiverSettingsEdit.style.display = ''
})

saveBusinessSettingsBtn.addEventListener('click', function(){
    ipcRenderer.send('settings-update-business-info', Array(businessNameEdit.value, businessAddressEdit.value, businessAddress2Edit.value, businessPNumEdit.value, businessEMailEdit.value))
})

enableSignatureSigningSwitch.addEventListener('click', function(){
    console.log(enableSignatureSigningSwitch.checked);
    ipcRenderer.send('settings-update-esign-enable', enableSignatureSigningSwitch.checked)
})

cancelBusinessSettingsBtn.addEventListener('click', function(){
    businessSettingsDisplay.style.display = ''
    businessSettingsEdit.style.display = 'none'
})

saveBusinessWaiverSettingsBtn.addEventListener('click', function(){
    ipcRenderer.send('settings-update-business-waiver-info', theWaiverEdit.value)
})

cancelBusinessWaiverSettingsBtn.addEventListener('click', function(){
    businessWaiverSettingsDisplay.style.display = ''
    businessWaiverSettingsEdit.style.display = 'none'
})

quickbooksConnect.addEventListener('click', function() {
    quickbooksConnect.style.display = 'none'
    ipcRenderer.send('quickbooks-connect')
})

importProductsQBBtn.addEventListener('click', function() {
    ipcRenderer.send('quickbooks-import-products')
})

quickbooksDisConnect.addEventListener("click", function(){
    ipcRenderer.send('settings-quickbooks-disconnect')
})

debugModeSwitch.addEventListener('change', function(){
    ipcRenderer.send('settings-debug-mode-toggle', debugModeSwitch.checked)
})

importMembershipModeSwitch.addEventListener('change', function(){
    ipcRenderer.send('settings-import-membership-mode-toggle', importMembershipModeSwitch.checked)
})

hideNPPSwitch.addEventListener('change', function(){
    ipcRenderer.send('settings-hide-npp-toggle', hideNPPSwitch.checked)
})

includeExpireTimeRenewSwitch.addEventListener('change', function(){
    ipcRenderer.send('settings-include-expire-time-renew-toggle', includeExpireTimeRenewSwitch.checked)
})

mandatoryDNANotesSwitch.addEventListener('change', function(){
    ipcRenderer.send('settings-mandatory-DNANotes-toggle', mandatoryDNANotesSwitch.checked)
})

enableRegisterSystem.addEventListener('change', function(){
    ipcRenderer.send('settings-register-system-toggle', enableRegisterSystem.checked)
})

editSaveDir.addEventListener('click', function () {
    ipcRenderer.send('edit-save-dir')
})

if (invWarnEMailDiv) {
    invWarnEMailDiv.style.display = 'none'
}

invWarnEMail.addEventListener('input', function(){
    invWarnEMailDiv.style.display = ''
})

invWarnEMailBtn.addEventListener('click', function(){
    ipcRenderer.send('settings-update-invwarnemail', invWarnEMail.value)
})

if (checkoutMsgDiv) {
    checkoutMsgDiv.style.display = 'none'
}

checkoutMsg.addEventListener('input', function(){
    checkoutMsgDiv.style.display = ''
})

checkoutMsgBtn.addEventListener('click', function(){
    ipcRenderer.send('settings-update-checkoutmsg', checkoutMsg.value)
})

if (shiftTimeDiv) {
    shiftTimeDiv.style.display = 'none'
}

bshiftTime.addEventListener('input', function(){
    shiftTimeDiv.style.display = ''
})

cshiftTime.addEventListener('input', function(){
    shiftTimeDiv.style.display = ''
})

ashiftTime.addEventListener('input', function(){
    shiftTimeDiv.style.display = ''
})

shiftTimeBtn.addEventListener('click', function(){
    ipcRenderer.send('settings-update-shifttimes', Array(ashiftTime.value, bshiftTime.value, cshiftTime.value))
})

// Account

if (userAccounts) {
    ipcRenderer.send('request-users')
    editAccountDiv.style.display = 'none'
}

editAccountSave.addEventListener('click', function(){
    editAccountDiv.style.display = 'none'
    if (creatingAccount) {
        creatingAccount = false
        editingAccessCodeDiv.style.display = ''
        editingAccessCode.style.display = ''
        ipcRenderer.send('account-create', Array(editingEMail.value, editingDisplayName.value, editingRank.value))
    } else {
        ipcRenderer.send('account-edit', Array(editingID, editingDisplayName.value, editingRank.value, editingAccessCode.value, permissionViewProductsPage.checked, permissionEditCategory.checked, permissionEditProducts.checked, permissionEditDiscounts.checked, permissionWaiveProducts.checked, permissionEditCoreProducts.checked, permissionEditSystemSettings.checked, permissionEditRegisters.checked, permissionImportMemberMode.checked, permissionEditDNAAdd.checked, permissionEditDNARemove.checked, permissionEditTagAdd.checked, permissionEditTagRemove.checked, permissionEditMemberNotes.checked, permissionEditMemberFiles.checked, permissionDeleteMembers.checked, permissionEditAnalytics.checked, permissionEditVDTransactions.checked, permissionEditQBConnect.checked))    
        document.getElementById('row' + editingID).remove()
    }
})

editAccountCancel.addEventListener('click', function(){
    editAccountDiv.style.display = 'none'
    if (creatingAccount) {
        creatingAccount = false
        editingAccessCodeDiv.style.display = ''
        editingAccessCode.style.display = ''
    }
})

editingAccessCodeDiv.addEventListener('click', function () {
    editingAccessCode.disabled = false
})

addAccountBtn.addEventListener('click', function(){
    creatingAccount = true
    editAccountDiv.style.display = ''
    editingAccessCodeDiv.innerHTML = '<b>NOTE: Permisisons will not save! You must go back and edit the user that is created. You can ignore the below section and move to save/close buttons</b>'
    editingAccessCode.style.display = 'none'
})

ipcRenderer.send('request-account')

ipcRenderer.on('recieve-account2', (event, arg) => {
    console.log(arg);
    displayName.innerHTML = arg[0].displayName
    displayNameEdit.value = arg[0].displayName
    if (arg[0].rank == '1') {
        roleTxt.innerHTML = "Manager"        
    } else {
        roleTxt.innerHTML = "Employee"        
    }
    emailTxt.innerHTML = arg[0].email
    editEmail.value = arg[0].email
    if (arg[4]) {
        verifyEMailDisplay.style.display = 'none'
    }

    if (document.querySelector('html').getAttribute('data-bs-theme') == 'dark') {
        darkModeToggle2.checked = true
    }
    notidicationSecondsEdit.value = arg[0].notificationSecs || ''

    businessName.innerHTML = arg[1].businessName || ""
    businessAddress.innerHTML = arg[1].businessAddress || ""
    businessAddress2.innerHTML = arg[1].businessAddress2 || ""
    businessPNum.innerHTML = arg[1].businessPNum || ""
    businessEMail.innerHTML = arg[1].businessEMail || ""

    businessNameEdit.value = arg[1].businessName || ""
    businessAddressEdit.value = arg[1].businessAddress || ""
    businessAddress2Edit.value = arg[1].businessAddress2 || ""
    businessPNumEdit.value = arg[1].businessPNum || ""
    businessEMailEdit.value = arg[1].businessEMail || ""

    theWaiver.innerHTML = arg[1].theWaiver || "No Waiver Found"
    theWaiverEdit.innerHTML = arg[1].theWaiver || ""
    console.log('running');
    console.log(arg);
    
    if (arg[2]) {
       quickbooksConnect.disabled = true 
       quickbooksConnect.innerHTML = "Quickbooks Connected" 
       quickbooksConnect.className = 'btn btn-success'
       quickbooksDisConnect.style.display = ''
       importProductsQB.style.display = ''
    } else {
        quickbooksDisConnect.disabled = true
        importProductsQB.style.display = 'none'
    }

    debugModeSwitch.checked = arg[5]
    
    importMembershipModeSwitch.checked = arg[3]

    hideNPPSwitch.checked = arg[1].hideNPPSwitch

    saveDirTxt.innerHTML = arg[1].fileSaveSystemDir    

    if (arg[1].fileSaveSystem || Array.isArray(arg[1].fileSaveSystem)) {
        arg[1].fileSaveSystem.forEach(theDir => {
            var opt = document.createElement('li');
            var opt2 = document.createElement('br')
            opt.setAttribute("theDir", theDir)
            opt.innerHTML = '<button class="btn btn-danger">' + theDir + '</button>';
            opt.addEventListener('click', function () {
                ipcRenderer.send('remove-dir', opt.getAttribute('theDir'))
                opt.style.display = 'none'
                opt2.style.display = 'none'
            })
            editModalDirs.appendChild(opt);
            editModalDirs.appendChild(opt2);
        });
    }

    invWarnEMail.value = arg[1].invWarnEMail || ""
    if (invWarnEMailDiv) {
        invWarnEMailDiv.style.display = 'none'        
    }
    checkoutMsg.value = arg[1].checkoutMsg || ""
    if (checkoutMsgDiv) {
        checkoutMsgDiv.style.display = 'none'
    }
    ashiftTime.value = arg[1].shiftTimeA || ""
    bshiftTime.value = arg[1].shiftTimeB || ""
    cshiftTime.value = arg[1].shiftTimeC || ""
    includeExpireTimeRenewSwitch.checked = arg[1].includeExpireTimeRenew || false
    mandatoryDNANotesSwitch.checked = arg[1].mandatoryDNANotes || false
    enableRegisterSystem.checked = arg[1].registerSystem || false
    if (shiftTimeDiv) {
        shiftTimeDiv.style.display = 'none'
    }
})

ipcRenderer.on('recieve-users', (event, arg) => {
    console.log(arg);
    if (document.getElementById('row' + arg[0])) {
        return
    }

    var row = userAccounts.insertRow(1);
    row.id = 'row' + arg[0];
    row.setAttribute('theID', arg[0])
    var cell1 = row.insertCell(0);
    cell1.id = 'nameCell' + arg[0];
    var cell2 = row.insertCell(1);
    cell2.id = 'rankCell' + arg[0];
    var cell3 = row.insertCell(2);
    cell3.id = 'actionCell' + arg[0];

//    cell1.outerHTML = "<th scope='row' id='lockerRoomNumCell" + arg[0] + "'>" + parseInt(arg[1].lockerRoomStatus[1]) + "</th>"
    cell1.innerHTML = arg[1].displayName;
    if (Number(arg[1].rank == 0)) {
        cell2.innerHTML = "Employee";
    } else {
        cell2.innerHTML = "Manager";
    }

    cell3.innerHTML = "<button class='btn btn-warning' type='button' id='edit" + arg[0] + "'>Edit</button> <button class='btn btn-danger' type='button' id='delete" + arg[0] + "'>Delete</button> <button class='btn btn-primary' type='button' id='resetpass" + arg[0] + "'>Reset Password</button>"

    document.getElementById('edit'+arg[0]).addEventListener('click', function(){
        editingID = arg[0]
        editAccountDiv.style.display = ''
        editingDisplayName.value = arg[1].displayName
        editingEMail.value = arg[1].email
        editingRank.value = arg[1].rank
        editingAccessCode.value = arg[1].access
        permissionViewProductsPage.checked = arg[1].permissionViewProductsPage
        permissionEditCategory.checked = arg[1].permissionEditCategory
        permissionEditProducts.checked = arg[1].permissionEditProducts
        permissionEditDiscounts.checked = arg[1].permissionEditDiscounts
        permissionWaiveProducts.checked = arg[1].permissionWaiveProducts
        permissionEditCoreProducts.checked = arg[1].permissionEditCoreProducts
        permissionEditSystemSettings.checked = arg[1].permissionEditSystemSettings
        permissionEditRegisters.checked = arg[1].permissionEditRegisters
        permissionImportMemberMode.checked = arg[1].permissionImportMemberMode
        permissionEditDNAAdd.checked = arg[1].permissionEditDNAAdd
        permissionEditDNARemove.checked = arg[1].permissionEditDNARemove
        permissionEditTagAdd.checked = arg[1].permissionEditTagAdd
        permissionEditTagRemove.checked = arg[1].permissionEditTagRemove
        permissionEditMemberNotes.checked = arg[1].permissionEditMemberNotes
        permissionEditMemberFiles.checked = arg[1].permissionEditMemberFiles
        permissionDeleteMembers.checked = arg[1].permissionDeleteMembers
        permissionEditAnalytics.checked = arg[1].permissionEditAnalytics
        permissionEditVDTransactions.checked = arg[1].permissionEditVDTransactions
        permissionEditQBConnect.checked = arg[1].permissionEditQBConnect
    })

    document.getElementById('delete'+arg[0]).addEventListener('click', function(){
        ipcRenderer.send('account-delete-user', Array(arg[0]))
    })

    document.getElementById('resetpass'+arg[0]).addEventListener('click', function(){
        ipcRenderer.send('account-change-password', Array(arg[0]))
    })
})