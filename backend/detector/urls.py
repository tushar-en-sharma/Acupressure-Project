from django.urls import path

from . import views

urlpatterns = [
    path("api/info/", views.api_info),
    path("api/detect/", views.api_detect),
]
