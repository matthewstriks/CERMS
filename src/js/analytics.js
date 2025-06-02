const { Chart, LogarithmicScale } = require('chart.js/auto');
let startTime = document.getElementById('startTime')
let endTime = document.getElementById('endTime')
let runAnalytics = document.getElementById('runAnalytics')
let configureDiv = document.getElementById('configureDiv')
let analyticsTabs = document.getElementById('analyticsTabs')
let tnomLbl = document.getElementById('tnomLbl')

if (analyticsTabs) {
  analyticsTabs.style.display = 'none';
}

if (runAnalytics) {
  runAnalytics.addEventListener('click', function () {
    ipcRenderer.send('analytics-run', Array(startTime.value || false, endTime.value || false))
  })
}

ipcRenderer.on('analytics-return', async (event, arg) => {
  console.log("Hey, I got the analytics data back", arg);
  configureDiv.style.display = 'none';
  analyticsTabs.style.display = '';

  let timeArray = Array('12a', '1a', '2a', '3a', '4a', '5a', '6a', '7a', '8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '10p', '11p')
  let timeDataArray = Array()
  let timeActivityDataArray = Array()
  let timeChartColors = Array()
  let memberTypeArray = Array()
  let memberTypeArrayData = Array()
  let memberTypeColorsArray = Array()
  let activityTypeArray = Array()
  let activityTypeArrayData = Array()
  let activityTypeColorsArray = Array()

  let orderTypesArray = Array()
  let orderTypeArray = Array()
  let orderTypeColorsArray = Array()
  let timeOrderDataArray = Array()

  let productsArray = Array()

  timeArray.forEach(element => {
    timeChartColors.push('#' + Math.floor(Math.random() * 16777215).toString(16))
    timeDataArray.push(0)
    timeActivityDataArray.push(0)
    timeOrderDataArray.push(0)
  });

  arg[2].forEach(product => {
    productsArray.push(Array(product[0], product[1].name, 0))
    if (product[1].membership) {
      memberTypeArray.push(product[1].name)
      memberTypeArrayData.push(0)
      memberTypeColorsArray.push('#' + Math.floor(Math.random() * 16777215).toString(16))
    } else if (product[1].rental) {
      activityTypeArray.push(product[1].name)
      activityTypeArrayData.push(0)
      activityTypeColorsArray.push('#' + Math.floor(Math.random() * 16777215).toString(16))
    }
  });

  for (let index = 0; index < arg[0].length; index++) {
    const member = arg[0][index];
    let theDate = new Date(member[1].creation_time.seconds * 1000)
    let theHour = theDate.getHours()
    timeDataArray[theHour] = timeDataArray[theHour] + 1

    for (let index2 = 0; index2 < memberTypeArray.length; index2++) {
      let ttype = memberTypeArray[index2];
      if (ttype == member[1].membership_type) {
        memberTypeArrayData[index2] = memberTypeArrayData[index2] + 1
      }
    }
  }

  for (let index = 0; index < arg[1].length; index++) {
    const activity = arg[1][index];
    let theDate = new Date(activity[1].timeIn.seconds * 1000)
    let theHour = theDate.getHours()
    timeActivityDataArray[theHour] = timeActivityDataArray[theHour] + 1

    for (let index2 = 0; index2 < activityTypeArray.length; index2++) {
      let ttype = activityTypeArray[index2];
      if (ttype == activity[1].lockerRoomStatus[2]) {
        activityTypeArrayData[index2] = activityTypeArrayData[index2] + 1
      }
    }
  }
  for (let index = 0; index < arg[3].length; index++) {
    const order = arg[3][index];
    let theDate = new Date(order[1].timestamp.seconds * 1000)
    let theHour = theDate.getHours()
    timeOrderDataArray[theHour] = timeOrderDataArray[theHour] + 1

    productsArray.forEach(product => {
      order[1].products.forEach(orderProducts => {
        if (product[0] == orderProducts) {
          product[2] = product[2] + 1
        }
      });
    });
  }

  productsArray.forEach(product => {
    if (product[2] > 0) {
      orderTypesArray.push(product[1])
      orderTypeArray.push(product[2])
      orderTypeColorsArray.push('#' + Math.floor(Math.random() * 16777215).toString(16))
    }
  });


  var ctx = document.getElementById("memberTimeChart").getContext('2d');
  var memberTimeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: timeArray,
      datasets: [{
        label: 'Membership Signups',
        data: timeDataArray,
        backgroundColor: timeChartColors,
        borderColor: timeChartColors,
        borderWidth: 1
      }]
    },
    options: {
      scales: {
        yAxes: [{
          ticks: {
            beginAtZero: true
          }
        }]
      }
    }
  });

  var ctxP = document.getElementById("activityTypeChart").getContext('2d');
  var activityTypeChart = new Chart(ctxP, {
    type: 'pie',
    data: {
      labels: activityTypeArray,
      datasets: [{
        data: activityTypeArrayData,
        backgroundColor: activityTypeColorsArray,
        hoverBackgroundColor: activityTypeColorsArray
      }]
    },
    options: {
      responsive: true
    }
  });

  var ctx = document.getElementById("activityTimeChart").getContext('2d');
  var activityTimeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: timeArray,
      datasets: [{
        label: 'Activity Times',
        data: timeActivityDataArray,
        backgroundColor: timeChartColors,
        borderColor: timeChartColors,
        borderWidth: 1
      }]
    },
    options: {
      scales: {
        yAxes: [{
          ticks: {
            beginAtZero: true
          }
        }]
      }
    }
  });

  var ctxP = document.getElementById("memberTypeChart").getContext('2d');
  var memberTypeChart = new Chart(ctxP, {
    type: 'pie',
    data: {
      labels: memberTypeArray,
      datasets: [{
        data: memberTypeArrayData,
        backgroundColor: memberTypeColorsArray,
        hoverBackgroundColor: memberTypeColorsArray
      }]
    },
    options: {
      responsive: true
    }
  });

  var ctx = document.getElementById("orderTimeChart").getContext('2d');
  var orderTimeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: timeArray,
      datasets: [{
        label: 'Order Times',
        data: timeOrderDataArray,
        backgroundColor: timeChartColors,
        borderColor: timeChartColors,
        borderWidth: 1
      }]
    },
    options: {
      scales: {
        yAxes: [{
          ticks: {
            beginAtZero: true
          }
        }]
      }
    }
  });

  var ctxP = document.getElementById("orderTypeChart").getContext('2d');
  var orderTypeChart = new Chart(ctxP, {
    type: 'pie',
    data: {
      labels: orderTypesArray,
      datasets: [{
        data: orderTypeArray,
        backgroundColor: orderTypeColorsArray,
        hoverBackgroundColor: orderTypeColorsArray
      }]
    },
    options: {
      responsive: true
    }
  });

})

ipcRenderer.on('analytics-run-success', (event, arg) => {
})