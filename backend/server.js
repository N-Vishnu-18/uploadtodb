const exp = require('express');
const multer = require('multer');
const { GridFSBucket,ObjectId } = require('mongodb');
const mongoClient=require('mongodb').MongoClient;
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();


const app = exp();
app.use(exp.static(path.join(__dirname, '../client/build')));
app.use(exp.json());
app.use(cors());

const PORT = process.env.PORT || 5000;

// MongoDB connection

const client = new mongoClient(process.env.DB_URL);

let gridfs;
let db;
let uploadCollection;


mongoClient.connect(process.env.DB_URL)
.then(client=>{
    
  db = client.db('updb');
  gridfs = new GridFSBucket(db, { bucketName: 'uploads' });
  uploadCollection = db.collection('uploadcollection');
    //confirm db connections
    console.log("db connection succesfull")

})
.catch(err=>console.log("error in db connection",err))




// Multer middleware for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage: storage });

// Serve static files from the 'uploads' directory
app.use('/uploads', exp.static('uploads'));

// Route to handle file upload
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).send('Please upload a file');
    }

    const metadata = {
      filename: file.originalname,
      contentType: file.mimetype,
      uploadDate: new Date(),
    };

    // Insert metadata into MongoDB collection
    console.log('Inserting metadata into MongoDB');
    const result = await uploadCollection.insertOne(metadata);
    if (!result.insertedId) {
      throw new Error('Failed to insert metadata into MongoDB');
    }

    const fileId = result.insertedId;
    console.log('Metadata inserted with ID:', fileId);

    // Create a write stream to GridFS
    console.log('Creating GridFS write stream');
    const writestream = gridfs.openUploadStreamWithId(fileId, file.originalname, { metadata });

    fs.createReadStream(path.join(__dirname, 'uploads', file.filename))
      .pipe(writestream)
      .on('error', (error) => {
        console.error('Error writing to GridFS:', error);
        res.status(500).send(error.message);
      })
      .on('finish', () => {
        console.log('File written to GridFS');

        // Delete the temporary file
        fs.unlink(path.join(__dirname, 'uploads', file.filename), (err) => {
          if (err) {
            console.error('Error deleting temp file:', err);
          } else {
            console.log('Temp file deleted successfully');
          }
        });

        res.status(200).json({ message: 'File uploaded successfully', fileId });
      });

  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).send(error.message);
  }
});
app.get('/image/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  try {
    const downloadStream = gridfs.openDownloadStream(new ObjectId(fileId));
    downloadStream.on('error', (error) => {
      console.error('Error fetching file from GridFS:', error);
      res.status(404).send('File not found');
    });
    downloadStream.pipe(res);
  } catch (error) {
    console.error('Error fetching file from GridFS:', error);
    res.status(500).send('Internal Server Error');
  }
});
 // Start the server after successfully connecting to MongoDB
 app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
