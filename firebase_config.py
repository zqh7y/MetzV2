import firebase_admin
from firebase_admin import credentials, auth

# Load your service account JSON
cred = credentials.Certificate("./metz-firebase.json")
firebase_admin.initialize_app(cred)
