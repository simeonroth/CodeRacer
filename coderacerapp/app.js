console.log('-----started app.js-----');
var express = require('express');
var app = express();
var createError = require('http-errors');
var path = require('path');
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var port = process.env.PORT || 3000;
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var fs = require('fs');
var bodyParser = require('body-parser');
var mysql = require('mysql');
var ejs = require('ejs');
var safeEval = require('safe-eval');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

server.listen(port, () => {
  console.log('Server listening at port %d', port);
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
//app.use(express.static("public"));
app.use(express.static(path.join(__dirname, 'public')));
//app.use(express.static(__dirname + '/node_modules'));
app.use(bodyParser.urlencoded({
	extended: true
}));
app.use(bodyParser.json());
app.use('/', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

io.sockets.on('connect', function(socket) {
  var sessionid = socket.id;
  var roomid;
  console.log(sessionid + ' has joined');

  socket.on('createLobby', function(data){
    console.log('request to make a lobby from ' + sessionid);
    //socket.join(sessionid);
    roomid = sessionid;
    socket.join(sessionid);
    io.sockets.adapter.rooms[sessionid].users = {};
    io.sockets.adapter.rooms[sessionid].users[sessionid] = data.username;
    io.to(sessionid).emit('listPlayers', [io.sockets.adapter.rooms[sessionid].users]);
    socket.emit('createLobbyResponse', {
       id: sessionid, 
    }); 
  });
  
  socket.on('joinLobby', function(data) {
    if (io.sockets.adapter.rooms[data.joinID]) {
    console.log(sessionid + ' is joining ' + data.joinID + ' lobby');
    socket.join(data.joinID);
    roomid = data.joinID;
    var room = io.sockets.adapter.rooms[data.joinID];
    room.users[sessionid] = data.username;
    io.to(data.joinID).emit('listPlayers', [io.sockets.adapter.rooms[data.joinID].users]);
    io.to(data.joinID).emit('playerJoinMsg', sessionid + ' has joined the room.');
    }
    else {
	socket.emit('errJoinMsg', {
          invalidID: data.joinID});
	console.log('Someone tried to join ' + data.joinID + ' but it is invalid.');
    }
  });

  socket.on('sendCode', function(data) {
    console.log(data.problem);
    console.log(data.code);
    var numPassed = 0;
    var hasWon = 0;
    var room = io.sockets.adapter.rooms[roomid];

    var unitTests = fs.readFileSync(__dirname.replace('coderacerapp','problems/'+data.problem)+"/unitTests",'utf-8');
    unitTests = JSON.parse(unitTests);

    for (var index in unitTests){
	var inputoutput = unitTests[index];
    	var unitTest = data.problem+".apply(this,"+JSON.stringify(inputoutput.input)+");\n";
    	try{
		var result = safeEval(unitTest+data.code);
    		if (result == inputoutput.output) numPassed++;
	}
	catch (ex){}
    }
	
    hasWon = numPassed == unitTests.length;
    if (hasWon) {
	room.placement++;
    }
    socket.emit('sendCodeResponse', {
	numPassed: numPassed,
	numTotal: unitTests.length,
	hasWon: numPassed == unitTests.length,
	placement: room.placement
    });
  });

 
  socket.on('disconnect', function(){
    var room = io.sockets.adapter.rooms[roomid];
    if (room){
      delete room.users[sessionid];
      io.to(roomid).emit('playerDCMsg', sessionid + ' has left.');
      io.to(roomid).emit('listPlayers', [io.sockets.adapter.rooms[roomid].users]);
    }
  });

  socket.on('startGame', function() {
	var room = io.sockets.adapter.rooms[roomid];
	room.placement = 0;
	fs.readdir('../problems', function(err, items) {
		if (err) console.log(err);
		var index = Math.floor(Math.random() * items.length);
		console.log(items.length);
		var problemName = items[index];
		console.log(index);
		console.log(problemName);
		
		var problem = fs.readFileSync(__dirname.replace('coderacerapp','problems/'+problemName)+"/problem",'utf-8');
		var header = fs.readFileSync(__dirname.replace('coderacerapp','problems/'+problemName)+"/functionHeader",'utf-8');
		var unitTests = fs.readFileSync(__dirname.replace('coderacerapp','problems/'+problemName)+"/unitTests",'utf-8');

		io.to(roomid).emit('startGameResponse', {
			problemName: problemName,
			problem: problem,
			header: header,
			unitTests: JSON.parse(unitTests)
		});
	});
  });
});



console.log('~~~~~end of app.js~~~~~');
module.exports = app;
