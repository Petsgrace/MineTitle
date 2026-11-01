"""
URL configuration for onlineapplication project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic.base import RedirectView
from django.views.generic import TemplateView
from django.views.static import serve

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/', include('onlineapplicationapi.urls')),
    path('api/', include('onlineapplicationapi.urls')),
    path('favicon.ico', RedirectView.as_view(url='/static/favicon.png')),
    path('admin.html', TemplateView.as_view(template_name='admin.html'), name='admin-html'),
    path('mobile-app.html', TemplateView.as_view(template_name='mobile-app.html'), name='mobile-app-html'),
    re_path(r'^(?P<path>(css/|js/|assets/|logo\.png|favicon\.png|farmer-welcome\.png).*)$', serve, {'document_root': settings.BASE_DIR / 'frontend' / 'dist'}),
]

# Serve uploaded media files
# In development (DEBUG=True), static() is used. 
# In production (DEBUG=False), we add a re_path fallback so Django can still serve them if Nginx isn't fully configured.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
else:
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
        re_path(r'^(?P<path>[^/]+\.(?:png|jpg|jpeg|svg|ico|webp|gif))$', serve, {'document_root': settings.STATIC_ROOT}),
    ]

# SPA catch-all: serve index.html for all non-API, non-admin, non-static paths
# This lets React Router handle frontend routing in production
urlpatterns += [
    re_path(r'^(?!api/|admin/|static/|media/).*$',
            TemplateView.as_view(template_name='index.html'),
            name='spa-fallback'),
]
