ipcRenderer.send('uploadProductFile')

let theProductID;
let firebaseConfig
let fileName = document.getElementById('fileName')

var files = [];
document.getElementById("files").addEventListener("change", function (e) {
    files = e.target.files;
    for (let i = 0; i < files.length; i++) {
        console.log(files[i]);
        console.log(files[i].type.replace(/(.*)\//g, ''))
    }
});

document.getElementById("send").addEventListener("click", function () {
    if (files.length != 0) {
        for (let i = 0; i < files.length; i++) {
            var storage = firebase.storage().ref('/member-files/' + theProductID + '-' + files[i].name);
            var upload = storage.put(files[i]);

            upload.on(
                "state_changed",
                function progress(snapshot) {
                    var percentage = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    document.getElementById("progress").innerHTML = percentage + '%';
                    document.getElementById("progress").setAttribute('style', "width: " + percentage + "%;");
                    document.getElementById("progress").setAttribute('aria-valuenow', percentage);
                    //                    document.getElementById("progress").value = percentage;
                },

                function error() {
                    alert("error uploading file");
                },

                function complete() {
                    document.getElementById(
                        "uploading"
                    ).innerHTML += `${files[i].name} uploaded <br />`;
                    getFileUrl('/member-files/' + theProductID + '-' + files[i].name)
                }
            );
        }
    } else {
        alert("No file chosen");
    }
});

function getFileUrl(filename) {
    var storage = firebase.storage().ref(filename);

    storage
        .getDownloadURL()
        .then(function (url) {
            ipcRenderer.send('uploadProductFile-complete', Array(theProductID, url, fileName.value, filename))
        })
        .catch(function (error) {
            console.log("error encountered");
        });
}

ipcRenderer.on('uploadProductFile-return', (event, arg) => {
    firebaseConfig = arg[0]
    firebase.initializeApp(firebaseConfig);

    document.getElementById('pTxt').innerHTML = 'Upload file for member ID: ' + arg[1]

    theProductID = arg[1]
})
