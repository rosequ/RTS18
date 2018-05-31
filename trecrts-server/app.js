var express = require('express');
var device = require('express-device');
var path = require('path');
var favicon = require('serve-favicon');
var morgan = require('morgan');
var mysql = require('mysql')
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var winston = require('winston')
winston.emitErrs = true;
require('winston-mysql-transport').Mysql;

var logger = new winston.Logger({
  transports : [
    new winston.transports.Console({
      level : 'debug',
      handleExceptions : true,
      json: false,
      colorize: true
    }),
    new winston.transports.Mysql({
      database:'trec_rts',
      host:'localhost',
      connectionLimit:15,
      table:'log_table',
      user: 'royal'}) 
  ],
  exitOnError: false
})
logger.stream = {
  write: function(message,encoding){
    logger.info(message) 
  }
}
var app = express();
app.io = require('socket.io')()

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

var routes = require('./routes/index')(app.io);

// DATABASE config
var config = {user: 'royal', host: 'localhost', database: 'trec_rts', connectionLimit: 30};
var connection = mysql.createPool(config);

app.use(device.capture());

app.use(function(req,res,next){
  res.header('Access-Control-Allow-Origin',"*");
  res.header('Access-Control-Allow-Headers','Origin, X-Requested-With, Content-Type, Accept')
  req.setTimeout(0)
  res.setTimeout(0)
  req.db = connection;
  next();
});

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
//app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(morgan('combined',{'stream':logger.stream}))
//app.use(morgan('dev'))
app.use(express.static(path.join(__dirname, 'public')));
app.use('/', routes);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});


module.exports = app;
